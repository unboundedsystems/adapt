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
    Handle,
    handle,
    Sequence,
    SFCDeclProps,
    useImperativeMethods,
    useMethod,
} from "@adpt/core";
import { ConnectToInstance, useConnectTo } from "../ConnectTo";
import { Container, Environment, mergeEnvPairs } from "../Container";
import { DockerImageInstance } from "../docker";
import { NetworkService, NetworkServiceScope } from "../NetworkService";
import { Service } from "../Service";
import { LocalNodeImage } from "./LocalNodeImage";

/**
 * Props for {@link nodejs.NodeService}.
 * @public
 */
export interface NodeServiceProps {
    /**
     * Handles for services that this component connects to.
     * @remarks
     * The referenced service components must implement the
     * {@link ConnectToInstance} interface. The Node Container will be
     * started with the combined set of environment variables that are
     * provided by all of the referenced components'
     * {@link ConnectToInstance.connectEnv | connectEnv} methods.
     *
     * In case of environment variable naming conflicts among those in
     * from the `connectTo` prop, the value from the handle with the highest
     * index in the `connectTo` array will take precedence.
     * In case of naming conflicts between `connectTo` and `env`, the value
     * in `env` will take precedence.
     * @defaultValue `[]`
     */
    connectTo: Handle<ConnectToInstance> | Handle<ConnectToInstance>[];
    /**
     * Dependencies that must be deployed before the Container image will
     * build.
     * @remarks
     * Note that the NetworkService will also not deploy before the
     * Container image has been built.
     * @defaultValue `[]`
     */
    deps: Handle | Handle[];
    /**
     * Object containing environment variables that the Container will be
     * started with.
     * @defaultValue `{}`
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
    connectTo: [],
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
 * - `hostname(): string | undefined`
 *
 *   Returns the hostname of the NetworkService, once it is known.
 *
 * - `port(): number | undefined`
 *
 *   Returns the port number of the NetworkService, once it is known.
 *
 * - `image():` {@link docker.ImageInfo} | `undefined`
 *
 *   Information about the successfully built image, once it has been built.
 *
 * @param props - See {@link nodejs.NodeServiceProps}
 * @public
 */
export function NodeService(props: SFCDeclProps<NodeServiceProps, typeof defaultProps>) {
    const { connectTo, deps, env, externalPort, port: targetPort, scope, srcDir } = props as NodeServiceProps;

    const netSvc = handle();
    const nodeCtr = handle();

    const connectEnvs = useConnectTo(connectTo);
    const finalEnv = mergeEnvPairs({ HTTP_PORT: `${targetPort}` }, connectEnvs, env);

    const img = handle<DockerImageInstance>();
    const image = useMethod(img, "latestImage");

    useImperativeMethods(() => ({
        hostname: () => callInstanceMethod(netSvc, undefined, "hostname"),
        port: () => callInstanceMethod(netSvc, undefined, "port"),
        image: () => image,
    }));

    return <Sequence key={props.key} >
        {deps}
        <LocalNodeImage key={props.key + "-img"} handle={img} srcDir={srcDir} options={{ runNpmScripts: "build" }} />
        <Service key={props.key} >
            <NetworkService
                key={props.key + "-netsvc"}
                handle={netSvc}
                endpoint={nodeCtr}
                port={externalPort || targetPort}
                targetPort={targetPort}
                scope={scope}
            />
            <Container
                key={props.key}
                name="node-service"
                handle={nodeCtr}
                environment={finalEnv}
                image={img}
                ports={[targetPort]}
                imagePullPolicy="Never"
            />
        </Service>
    </Sequence>;
}
export default NodeService;

// FIXME(mark): The "as any" can be removed when we upgrade to TS > 3.2
(NodeService as any).defaultProps = defaultProps;
