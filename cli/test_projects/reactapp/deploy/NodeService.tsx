import Adapt, { Handle, handle, Sequence, useImperativeMethods } from "@usys/adapt";
import {
    callInstanceMethod,
    Container,
    Environment,
    handles,
    mergeEnvPairs,
    NetworkService,
    NetworkServiceScope,
    Service,
} from "@usys/cloud";
import { useBuildNodeContainer } from "@usys/cloud/nodejs";

export type Env = Environment;

export default function NodeService(props: {
    srcDir: string, port?: number, externalPort?: number, env: Env,
    deps?: Handle | Handle[], scope?: NetworkServiceScope
}) {
    const { image, buildObj } =
        useBuildNodeContainer(props.srcDir, {runNpmScripts: "build"});
    const h = handles();
    const targetPort = props.port || 8081;
    const externalPort = props.externalPort || targetPort;
    const scope = props.scope || "cluster-internal";

    const netSvc = handle();
    useImperativeMethods(() => ({
        hostname: () => callInstanceMethod(netSvc, undefined, "hostname"),
        port: () => callInstanceMethod(netSvc, undefined, "port"),
        image,
    }));

    const env = mergeEnvPairs({ HTTP_PORT: `${targetPort}` }, props.env);

    return <Sequence>
        {props.deps || []}
        {buildObj}
        <Service>
            <NetworkService
                handle={netSvc}
                endpoint={h.create.nodeCtr}
                port={externalPort}
                targetPort={targetPort}
                scope={scope}
            />
            {image ?
                <Container
                    name="node-service"
                    handle={h.nodeCtr}
                    environment={env}
                    image={image.nameTag!}
                    ports={[ targetPort ]}
                    imagePullPolicy="Never"
                />
                : null}
        </Service>
    </Sequence>;
}
