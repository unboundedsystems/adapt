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
    SFCBuildProps,
    SFCDeclProps,
    useDeployedWhen,
    useImperativeMethods,
    useMethod,
    waiting,
} from "@adpt/core";
import { ExcludeKeys } from "@adpt/utils";
import { busyboxImage, dockerRun } from "./cli";
import { DockerContainer } from "./DockerContainer";
import { DockerContainerProps, NameTagString, RegistryString } from "./types";

/**
 * Props for {@link docker.LocalDockerRegistry}
 * @public
 */
export interface LocalDockerRegistryProps extends ExcludeKeys<DockerContainerProps, "image"> {
    /**
     * Tag to use for official Docker Hub `registry` image repo.
     */
    imageTag: NameTagString;
    /**
     * Port number to expose for the registry HTTP server.
     */
    port: number;
}

const defaultProps = {
    dockerHost: process.env.DOCKER_HOST,
    imageTag: "2",
    port: 5000,
};

/** @public */
export interface DockerRegistryInstance {
    registry(): RegistryString | undefined;
}

/**
 * Runs a Docker registry in a container.
 * @remarks
 * Implements {@link docker.DockerRegistryInstance}.
 *
 * @public
 */
export function LocalDockerRegistry(props: SFCDeclProps<LocalDockerRegistryProps, typeof defaultProps>) {
    const { handle: _h, imageTag, port, ...buildProps } =
        props as SFCBuildProps<LocalDockerRegistryProps, typeof defaultProps>;
    const ctr = handle();

    const dockerHost = buildProps.dockerHost;
    const image = `registry:${imageTag}`;

    const ipAddr = useMethod<string | undefined>(ctr, undefined, "dockerIP", props.networks && props.networks[0]);

    function registry(network?: string) {
        let netIP = ipAddr;
        if (network) netIP = callInstanceMethod(ctr, undefined, "dockerIP", network);
        if (netIP === undefined) return undefined;
        return `${netIP}:${props.port}`;
    }

    useDeployedWhen(async () => {
        let reason: string;
        if (ipAddr) {
            try {
                await dockerRun({
                    autoRemove: true,
                    background: false,
                    image: busyboxImage,
                    dockerHost,
                    command: [ "wget", "--spider", `http://${registry()}/v2/`],
                });
                return true;
            } catch (err) {
                reason = err.message;
            }
        } else {
            reason = "No IP address for container";
        }
        return waiting(`Waiting for registry to become ready (${reason})`);
    });

    useImperativeMethods<DockerRegistryInstance>(() => ({
        registry,
    }));

    return <DockerContainer handle={ctr} image={image} {...buildProps} />;
}
(LocalDockerRegistry as any).defaultProps = defaultProps;
