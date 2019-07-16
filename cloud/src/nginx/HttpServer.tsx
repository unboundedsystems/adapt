import Adapt, {
    DeployStatus,
    handle,
    SFCBuildProps,
    SFCDeclProps,
    useDeployedWhen,
    useImperativeMethods,
    useState,
    waiting,
} from "@adpt/core";
import { Dispatcher, notNull } from "@adpt/utils";
import {
    callInstanceMethod,
    Container,
    ImageInfo,
    NetworkService,
    Service,
    useDockerBuild,
} from "..";
import {
    Destination,
    HttpServer as AbsHttpServer,
    HttpServerProps,
    Location,
    Match,
    useFilesInfo,
} from "../http";

const nginxImg = "nginx:latest";

/*
 * Match
 */
const matchWriters = new Dispatcher<Match, string>("Match");
const matchConfig = (m: Match) => matchWriters.dispatch(m);
matchWriters.add("path", (m) => m.path);
matchWriters.add("regex", (m) => `~ ${m.regex}`);

/*
 * Dest
 */
const destWriters = new Dispatcher<Destination, string>("Destination");
const destConfig = (d: Destination) => destWriters.dispatch(d);
destWriters.add("files", (d) => d.filesRoot ? `root ${d.filesRoot};` : "");

/*
 * Location
 */
const locationConfig = (loc: Location) => `
        location ${matchConfig(loc.match)} {
            ${destConfig(loc.dest)}
        }
`;

function useMakeNginxConf(props: HttpServerProps) {
    const servers = props.servers || [];
    if (servers.length === 0) {
        throw new Error(`Nginx configuration must contain at least one virtual server`);
    }
    if (servers.length > 1) {
        throw new Error(`Multiple servers not implemented yet`);
    }

    const serverConf = servers.map((s) => {
        const locations = s.locations.map(locationConfig);
        const root = s.filesRoot ? `root ${s.filesRoot};` : "";
        return `
    server {
        ${root}
        listen ${props.port};
${locations.join("\n")}
    }
`;
    });

    return `
events {
    worker_connections 1024;
}

http {
    include       /etc/nginx/mime.types;
    default_type  application/octet-stream;

${serverConf.join("\n")}
}
`;
}

const defaultProps = {
    ...AbsHttpServer.defaultProps,
    servers: [{
        filesRoot: "/www/static",
        locations: [{
            match: { type: "path", path: "/" },
            dest: { type: "files" },
        }],
    }]
};

export function HttpServer(propsIn: SFCDeclProps<HttpServerProps, typeof defaultProps>) {
    const props = propsIn as SFCBuildProps<HttpServerProps, typeof defaultProps>;
    const netSvc = handle();
    const nginx = handle();
    const [oldImage, setOldImage] = useState<ImageInfo | undefined>(undefined);

    const nginxConf = useMakeNginxConf(props);

    const fileInfo = useFilesInfo(props.add) || [];
    const commands = fileInfo.map((f) => f.dockerCommands).join("\n");
    const stages = fileInfo.map((f) => f.stage).filter(notNull);

    //FIXME(manishv) nginx config check will only pass if all hostnames can be resolved locally, how to fix?
    //if (false) useAsync(async () => checkNginxConf(nginxConf), undefined);

    const dockerfile = `
        FROM ${nginxImg}
        RUN apt-get update && \
            apt-get install --no-install-recommends --no-install-suggests -y inotify-tools && \
            apt-get clean
        WORKDIR /nginx
        COPY --from=files / .
        ${commands}
        CMD bash /nginx/start_nginx.sh
        `;

    const { image, buildObj } = useDockerBuild(() => ({
            dockerfile,
            files: [{
                path: "start_nginx.sh",
                contents:
                    `#!/usr/bin/env bash
                    nginx -g "daemon off;" -c /nginx/nginx.conf
                    `
            },
            {
                path: "nginx.conf",
                contents: nginxConf
            }],
            contextDir: props.localAddRoot,
            options: {
                imageName: "nginx-static",
                uniqueTag: true
            },
            stages,
        })
    );

    const curImage = image || oldImage;
    setOldImage(curImage);

    useImperativeMethods(() => ({
        hostname: () => callInstanceMethod(netSvc, undefined, "hostname"),
        port: () => callInstanceMethod(netSvc, undefined, "port")
    }));

    useDeployedWhen((gs) => {
        if (gs !== DeployStatus.Deployed) return true;
        if (image) return true;
        return waiting(`Waiting for container image to ${oldImage ? "re-" : ""}build`);
    });

    const ret = <Service>
        {buildObj}
        <NetworkService
            handle={netSvc}
            endpoint={nginx}
            port={props.port}
            targetPort={props.port}
            scope={props.scope}
        />
        {curImage ?
            <Container
                handle={nginx}
                name="nginx-static"
                image={curImage.nameTag!}
                ports={[props.port]}
                imagePullPolicy="Never"
            />
            : null}
    </Service >;

    return ret;
}

// FIXME(mark): The "as any" can be removed when we upgrade to TS > 3.2
(HttpServer as any).defaultProps = defaultProps;

export default HttpServer;
