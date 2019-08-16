/*
 * Copyright 2018-2019 Unbounded Systems, LLC
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
    AdaptElement,
    AnyProps,
    callNextInstanceMethod,
    Handle,
    isElement,
    PrimitiveComponent,
    WithChildren,
} from "@adpt/core";

export type ServicePort = number | string;
export type NetworkServiceScope =
    "local" |
    "cluster-internal" |
    "cluster-public" |
    "external";

export interface NetworkServiceProps extends WithChildren {
    ip?: string;
    name?: string;
    port: ServicePort;
    protocol?: string;
    scope?: NetworkServiceScope;
    targetPort?: ServicePort;
    endpoint?: Handle;
}

/**
 * An abstract component that represents a network service.
 */
export abstract class NetworkService extends PrimitiveComponent<NetworkServiceProps> {
    static defaultProps = {
        protocol: "TCP",
        scope: "cluster-internal",
    };

    /**
     * Returns the hostname of the NetworkService, once it is known.
     */
    hostname(): string | undefined {
        const hand = this.props.handle;
        if (!hand) throw new Error(`Internal error: Element props.handle is null`);
        return callNextInstanceMethod(hand, undefined, "hostname");
    }

    /**
     * Returns the port number of the NetworkService, once it is known.
     */
    port(): number | undefined {
        const hand = this.props.handle;
        if (!hand) throw new Error(`Internal error: Element props.handle is null`);
        return callNextInstanceMethod(hand, undefined, "port");
    }
}
export default NetworkService;

export function targetPort(elemOrProps: NetworkServiceProps | AdaptElement): ServicePort {
    let props: AnyProps = elemOrProps;
    if (isElement(elemOrProps))props = elemOrProps.props;
    if (props.targetPort) return props.targetPort;
    if (props.port) return props.port;
    throw new Error(`Cannot compute target port for props ${props}`);
}

export function isNetworkServiceElement(el: AdaptElement): el is AdaptElement<NetworkServiceProps> {
    return el.componentType as any === NetworkService;
}
