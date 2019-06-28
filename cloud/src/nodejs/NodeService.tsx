import Adapt, { Handle, handle, Sequence, SFCDeclProps, useImperativeMethods } from "@adpt/core";
import {
    callInstanceMethod,
    Container,
    Environment,
    mergeEnvPairs,
    NetworkService,
    NetworkServiceScope,
    Service,
} from "..";
import { useBuildNodeContainer } from "./useBuildNodeContainer";

export interface NodeServiceProps {
    deps: Handle | Handle[];
    env: Environment;
    externalPort?: number;
    port: number;
    scope: NetworkServiceScope;
    srcDir: string;
}

const defaultProps = {
    deps: [],
    env: {},
    port: 8080,
    scope: "cluster-internal",
};

export function NodeService(props: SFCDeclProps<NodeServiceProps, typeof defaultProps>) {
    const { deps, env, externalPort, port: targetPort, scope, srcDir } = props as NodeServiceProps;
    const { image, buildObj } =
        useBuildNodeContainer(srcDir, {runNpmScripts: "build"});

    const netSvc = handle();
    const nodeCtr = handle();
    useImperativeMethods(() => ({
        hostname: () => callInstanceMethod(netSvc, undefined, "hostname"),
        port: () => callInstanceMethod(netSvc, undefined, "port"),
        image,
    }));

    const finalEnv = mergeEnvPairs({ HTTP_PORT: `${targetPort}` }, env);

    return <Sequence>
        {deps}
        {buildObj}
        <Service>
            <NetworkService
                handle={netSvc}
                endpoint={nodeCtr}
                port={externalPort || targetPort}
                targetPort={targetPort}
                scope={scope}
            />
            {image ?
                <Container
                    name="node-service"
                    handle={nodeCtr}
                    environment={finalEnv}
                    image={image.nameTag!}
                    ports={[ targetPort ]}
                    imagePullPolicy="Never"
                />
                : null}
        </Service>
    </Sequence>;
}
export default NodeService;

// FIXME(mark): The "as any" can be removed when we upgrade to TS > 3.2
(NodeService as any).defaultProps = defaultProps;
