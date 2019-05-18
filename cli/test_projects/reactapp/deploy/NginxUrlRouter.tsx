import Adapt, {
    DeployStatus,
    Handle,
    useDeployedWhen,
    useState,
    waiting,
} from "@usys/adapt";

import {
    callInstanceMethod,
    Container,
    handles,
    ImageInfo,
    NetworkService,
    Service,
    useAsync,
    useDockerBuild
} from "@usys/cloud";
import {
    notNull,
    withTmpDir
} from "@usys/utils";
import { exec } from "child_process";
import { writeFile } from "fs-extra";
import * as path from "path";
import { URL } from "url";
import { isString, promisify } from "util";

const nginxImg = "nginx:latest";

export interface UrlRouterRoute {
    path: string;
    endpoint: Handle | string;
    upstreamPath?: string;
}
export interface UrlRouterProps {
    port: number;
    externalPort?: number;
    routes: UrlRouterRoute[];
}

interface ResolvedRoute {
    path: string;
    upstreamPath: string;
    url: string;
}

function upstream(_r: ResolvedRoute, i: number, _url: URL) {
    return `upstream_url_${i}`;
}

function getPort(lurl: URL) {
    if (lurl.port && lurl.port !== "") {
        return lurl.port;
    }
    switch (lurl.protocol) {
        case "http:": return 80;
        case "https:": return 443;
        default: return 80; //Throw here?
    }
}

function useMakeNginxConf(props: UrlRouterProps) {
    const [resolvedRoutes, setResolvedRoutes] = useState<ResolvedRoute[]>([]);
    setResolvedRoutes(() => props.routes.map((r) => {
        let lurl: string;
        if (isString(r.endpoint)) {
            lurl = r.endpoint;
        } else {
            const hostname = callInstanceMethod(r.endpoint, undefined, "hostname");
            const port = callInstanceMethod(r.endpoint, undefined, "port");
            if (!port || !hostname) return undefined;
            lurl = `http://${hostname}:${port}/`;
        }
        const upstreamPath = r.upstreamPath || "/";
        return { path: r.path, upstreamPath, url: lurl };
    }).filter(notNull));

    const locationBlocks = resolvedRoutes.map((r, i) => {
        const lurl = new URL(r.url);
        const varName = upstream(r, i, lurl);
        const { hostname, protocol } = lurl;
        const port = getPort(lurl);
        const upPath = r.upstreamPath;
        return `
            set $${varName} ${protocol}//${hostname}:${port};
            location ${r.path} {
                rewrite ^/${r.path}(.*) /${upPath}$1 break;
                proxy_pass $${varName};
                proxy_set_header Host $host;
            }
        `;
    });

    let locationText = locationBlocks.join("\n");
    if (locationBlocks.length === 0) {
        locationText = `location / {
            return ${(props.routes.length === 0) ? "404" : "503"};
        }
        `;
    }

    return `
events {
    worker_connections 1024;
}

http {
    resolver_timeout 1s;
    proxy_connect_timeout 11s;
    include conf.d/*;

    server {
        listen ${props.port};
        ${locationText}
    }
}
`;
}

const execP = promisify(exec);

async function checkNginxConf(conf: string) {
    return withTmpDir(async (dir) => {
        const confPath = path.join(dir, "nginx.conf");
        await writeFile(confPath, conf);
        try {
            // tslint:disable-next-line:max-line-length
            await execP(`cat ${confPath} | docker run -i --rm ${nginxImg} bash -c "cat - > /nginx.conf && nginx -t -c /nginx.conf"`,
                { timeout: 3600 });
        } catch (e) {
            if (e.signal !== null) {
                throw new Error("Timeout trying to validate nginx configuration");
            }

            if ((e.code != null) && (e.code !== 0)) {
                const errs = e.stdout.toString() + "\n" + e.stderr.toString();
                throw new Error(`Internal Error: generated invalid nginx configuration:
${errs}

**Configuration**
${conf}
`);
            }
            throw e;
        }
    });
}

function checkUrlEndpoints(routes: UrlRouterRoute[]) {
    const errs: string[] = [];
    for (const route of routes) {
        const ep = route.endpoint;
        if (!isString(ep)) continue;
        try {
            new URL(ep);
        } catch (e) {
            errs.push(`Invalid endpoint URL for "${route.path}": ${ep} `);
            continue;
        }
    }
    if (errs.length !== 0) throw new Error(`Error in routes for UrlRouter: \n${errs.join("\n")} \n`);
}

export function NginxUrlRouter(props: UrlRouterProps) {
    const h = handles();
    const [oldImage, setOldImage] = useState<ImageInfo | undefined>(undefined);

    checkUrlEndpoints(props.routes);
    const nginxConf = useMakeNginxConf(props);
    //FIXME(manishv) nginx config check will only pass if all hostnames can be resolved locally, how to fix?
    if (false) useAsync(async () => checkNginxConf(nginxConf), undefined);

    const { image, buildObj } = useDockerBuild(() => {
        return {
            dockerfile: `
                FROM ${nginxImg}
                WORKDIR /router
                COPY --from=files / .
                RUN apt-get update && \
                    apt-get install --no-install-recommends --no-install-suggests -y inotify-tools && \
                    chmod a+x start_nginx.sh make_resolvers.sh && \
                    apt-get clean
                CMD [ "/router/start_nginx.sh" ]
            `,
            files: [{
                path: "start_nginx.sh",
                contents:
                    `#!/bin/sh
                    mkdir conf.d
                    ./make_resolvers.sh
                    nginx -g "daemon off;" -c /router/nginx.conf
                    `
            },
            {
                path: "make_resolvers.sh",
                contents:
                    `#!/bin/sh
                    conf="resolver $(/usr/bin/awk 'BEGIN{ORS=" "} $1=="nameserver" {print $2}' /etc/resolv.conf);"
                    [ "$conf" = "resolver ;" ] && exit 0
                    confpath=conf.d/resolvers.conf
                    echo "$conf" > $confpath
                    `
            },
            {
                path: "nginx.conf",
                contents: nginxConf
            }],
            options: {
                imageName: "nginx-url-router",
                uniqueTag: true
            }
        };
    });

    useDeployedWhen((gs) => {
        if (gs !== DeployStatus.Deployed) return true;
        if (image) return true;
        return waiting(`Waiting for container image to ${oldImage ? "re-" : ""}build`);
    });

    const externalPort = props.externalPort || props.port;
    const curImage = image || oldImage;
    setOldImage(curImage);

    return <Service>
        {buildObj}
        <NetworkService
            endpoint={h.create.nginx}
            port={externalPort}
            targetPort={props.port}
            scope="external"
        />
        {curImage ?
            <Container
                handle={h.nginx}
                name="nginx-url-router"
                image={curImage.nameTag!}
                ports={[props.port]}
                imagePullPolicy="Never"
            />
            : null}
    </Service >;
}

export default NginxUrlRouter;
