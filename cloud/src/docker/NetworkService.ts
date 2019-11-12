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

import {
    callFirstInstanceWithMethod,
    SFCBuildProps,
    SFCDeclProps,
    useImperativeMethods,
} from "@adpt/core";
import {
    NetworkScope,
    NetworkService as AbsNetworkService,
    NetworkServiceInstance,
    NetworkServiceProps,
    ServicePort,
} from "../NetworkService";

const defaultProps = AbsNetworkService.defaultProps;

/**
 * Docker network service component, compatible with the abstract
 * {@link NetworkService} component.
 *
 * @remarks
 *
 * Implements the {@link NetworkServiceInstance} interface.
 * In a Docker deployment, there is no actual network service object to deploy.
 * So this is a "virtual" component that simply implements the required
 * instance methods for a NetworkService, but renders to null.
 *
 * This component is typically used by {@link docker.ServiceContainerSet}. The
 * {@link docker.ServiceContainerSet} component can be used to ensure the proper
 * network port configuration is applied to the `props.endpoint` container.
 *
 * @public
 */
export function NetworkService(props: SFCDeclProps<NetworkServiceProps, typeof defaultProps>) {
    const { endpoint = null, ip, port, scope, targetPort } =
        props as SFCBuildProps<NetworkServiceProps, typeof defaultProps>;

    if (ip) {
        throw new Error(`Setting IP address not supported for docker.NetworkService`);
    }
    const portNum = toPortNum(port);
    if (scope !== "external" && targetPort != null) {
        if (toPortNum(targetPort) !== portNum) {
            throw new Error(`Port number translation currently only supported ` +
                `by docker.NetworkService when scope is 'external'. ` +
                `(scope=${scope} port=${port}, targetPort=${targetPort})`);
        }
    }

    useImperativeMethods<NetworkServiceInstance>(() => ({
        hostname: (_scope?: NetworkScope) => {
            if (!endpoint) return undefined;
            return callFirstInstanceWithMethod(endpoint, undefined, "dockerIP");
        },
        port: () => portNum,
    }));

    return null;
}
NetworkService.defaultProps = defaultProps;

function toPortNum(input: ServicePort): number {
    const num = Number(input);
    if (isNaN(num) ||
        !Number.isInteger(num) ||
        num <= 0 ||
        num >= 65536) throw new Error(`Invalid port number ${input}`);
    return num;
}
