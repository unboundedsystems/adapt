/*
 * Copyright 2019 Unbounded Systems, LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import Adapt, {
    callInstanceMethod,
    handle,
    Sequence,
    SFCBuildProps,
    SFCDeclProps,
    useAsync,
    useState,
} from "@adpt/core";

import {
    notNull,
    withTmpDir
} from "@adpt/utils";
import { exec } from "child_process";
import { writeFile } from "fs-extra";
import * as path from "path";
import { URL } from "url";
import { isString, promisify } from "util";
import { Container } from "../Container";
import { LocalDockerImage } from "../docker";
import { handles } from "../handles";
import {
    checkUrlEndpoints,
    ResolvedRoute,
    UrlRouter as AbsUrlRouter,
    UrlRouterProps as AbsUrlRouterProps,
} from "../http";
import { NetworkService } from "../NetworkService";
import { Service } from "../Service";

const nginxImg = "nginx:latest";

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
        // NOTE: the set $encoded line is required because the captured
        // portion of the regex ($1) has been URL-decoded. The set line
        // re-encodes it. But using $1 directly on the proxy_pass line does not.
        return `
            set $${varName} ${protocol}//${hostname}:${port};
            location ~ ^${r.path}(.*)$ {
                set $encoded $${varName + upPath}$1;
                proxy_pass $encoded;
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

    const mainConfig: string[] = [];
    if (props.debug) mainConfig.push("error_log stderr debug;");

    return `
${mainConfig.join("\n")}

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

const defaultProps = {
    ...AbsUrlRouter.defaultProps,
    debug: false,
};

export interface UrlRouterProps extends AbsUrlRouterProps {
    debug: boolean;
}

export function UrlRouter(propsIn: SFCDeclProps<UrlRouterProps, typeof defaultProps>) {
    const props = propsIn as SFCBuildProps<UrlRouterProps, typeof defaultProps>;
    const h = handles();

    checkUrlEndpoints(props.routes);
    const nginxConf = useMakeNginxConf(props);
    //FIXME(manishv) nginx config check will only pass if all hostnames can be resolved locally, how to fix?
    if (false) useAsync(async () => checkNginxConf(nginxConf), undefined);

    const nginxExec = props.debug ? "nginx-debug" : "nginx";

    const img = handle();

    const externalPort = props.externalPort || props.port;

    return <Sequence key={props.key} >
        <LocalDockerImage
            handle={img}
            dockerfile={`
                FROM ${nginxImg}
                RUN apt-get update && \
                    apt-get install --no-install-recommends --no-install-suggests -y inotify-tools && \
                    apt-get clean
                WORKDIR /router
                COPY --from=files / .
                RUN chmod a+x start_nginx.sh make_resolvers.sh
                CMD [ "/router/start_nginx.sh" ]
            `}
            files={[{
                path: "start_nginx.sh",
                contents:
                    `#!/bin/sh
                    mkdir conf.d
                    ./make_resolvers.sh
                    ${nginxExec} -g "daemon off;" -c /router/nginx.conf
`
            },
            {
                path: "make_resolvers.sh",
                contents:
                    `#!/bin/sh
                    conf="resolver $(/usr/bin/awk 'BEGIN{ORS = " "} $1=="nameserver" {print $2}' /etc/resolv.conf);"
                    [ "$conf" = "resolver ;" ] && exit 0
                    confpath=conf.d/resolvers.conf
                    echo "$conf" > $confpath
                    `
            },
            {
                path: "nginx.conf",
                contents: nginxConf
            }]}
            options={{
                imageName: "nginx-url-router",
                uniqueTag: true
            }}
        />
        <Service key={props.key} >
            <NetworkService
                key={props.key + "-netsvc"}
                endpoint={h.create.nginx}
                port={externalPort}
                targetPort={props.port}
                scope="external"
            />
            <Container
                key={props.key}
                handle={h.nginx}
                name="nginx-url-router"
                image={img}
                ports={[props.port]}
                imagePullPolicy="Never"
            />
        </Service >
    </Sequence>;
}

export default UrlRouter;
