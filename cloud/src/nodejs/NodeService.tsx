import Adapt, { Handle, handle, Sequence, SFCDeclProps, useImperativeMethods } from "@adpt/core";
import {
    callInstanceMethod,
    Container,
    Environment,
    ImageInfo,
    mergeEnvPairs,
    NetworkService,
    NetworkServiceScope,
    Service,
    useMethod,
} from "..";
import { LocalNodeImage } from "./LocalNodeImage";

export interface NodeServiceProps {
    /**
     * Dependencies that must be deployed before the Container image will
     * build.
     * @remarks
     * Note that the NetworkService will also not deploy before the
     * Container image has been built.
     * @defaultValue []
     */
    deps: Handle | Handle[];
    /**
     * Object containing environment variables that the Container will be
     * started with.
     * @defaultValue {}
     */
    env: Environment;
    /**
     * The port that the NetworkService will expose.
     * @defaultValue Use the same port number as `port`
     */
    externalPort?: number;
    /**
     * The port number that the Node Container will use.
     * @defaultValue 8080
     */
    port: number;
    /**
     * Scope within which the NetworkService will be exposed.
     * @defaultValue "cluster-internal"
     */
    scope: NetworkServiceScope;
    /**
     * Root directory (which contains package.json) for the Node.js app
     * source code.
     */
    srcDir: string;
}

const defaultProps = {
    deps: [],
    env: {},
    port: 8080,
    scope: "cluster-internal",
};

/**
 * A partially abstract component that builds Node.js source code into a Container
 * and exposes a NetworkService.
 *
 * @remarks
 * To use this component, the `srcDir` prop must be the path to the root of
 * a Node.js project, which contains a package.json file. The component will
 * build a Docker container image by:
 *
 * - starting with an official Node.js base image
 *
 * - copying `srcDir` into the container image
 *
 * - executing `npm run build`
 *
 * - setting the container CMD to execute the `main` file specified in
 *   package.json
 *
 * Abstract components:
 *
 * This component uses the following abstract components which must be
 * replaced via style sheet rules:
 *
 * - {@link Service}
 *
 * - {@link NetworkService}
 *
 * - {@link Container}
 *
 * The {@link NetworkService} and {@link Container} components are both
 * children of the {@link Service} component.
 *
 * Instance methods:
 *
 * - hostname(): string | undefined
 *
 *   Returns the hostname of the NetworkService, once it is known.
 *
 * - port(): number | undefined
 *
 *   Returns the port number of the NetworkService, once it is known.
 *
 * Instance properties:
 *
 * - image: {@link ImageInfo} | undefined
 *
 *   Information about the successfully built image, once it has been built.
 */
export function NodeService(props: SFCDeclProps<NodeServiceProps, typeof defaultProps>) {
    const { deps, env, externalPort, port: targetPort, scope, srcDir } = props as NodeServiceProps;

    const netSvc = handle();
    const nodeCtr = handle();

    const finalEnv = mergeEnvPairs({ HTTP_PORT: `${targetPort}` }, env);

    const img = handle();
    const image = useMethod<ImageInfo | undefined>(img, undefined, "latestImage");

    useImperativeMethods(() => ({
        hostname: () => callInstanceMethod(netSvc, undefined, "hostname"),
        port: () => callInstanceMethod(netSvc, undefined, "port"),
        image
    }));

    return <Sequence>
        {deps}
        <LocalNodeImage handle={img} srcDir={srcDir} options={{ runNpmScripts: "build" }} />
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
                    ports={[targetPort]}
                    imagePullPolicy="Never"
                />
                : null}
        </Service>
    </Sequence>;
}
export default NodeService;

// FIXME(mark): The "as any" can be removed when we upgrade to TS > 3.2
(NodeService as any).defaultProps = defaultProps;
