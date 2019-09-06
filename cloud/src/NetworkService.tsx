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
 * External {@link NetworkScope}
 *
 * @public
 */
export const externalNetwork = "external";
/**
 *  Default {@link NetworkScope}, usually internal/cluster scope only 
 *
 * @public
 */
export const defaultNetwork = "default";
/**
 * Type for various network address scopes
 *
 * @remarks
 * The details of this type are very experimental.  Use the constants {@link externalNetwork}
 * and {@link defaultNetwork} instead of strings to reduce the chance of breakage.
 *
 * @beta
 */
export type NetworkScope = "external" | "default";

/**
 * Interface for components that expose Network Services via hostname and port
 *
 * @beta
 */
export interface NetworkServiceInstance {
    /**
     * Returns the hostname for the service from the given scope
     *
     * @param scope - the scope of the desired hostname ("default" cluster/internal, "external" - world accessible)
     * @returns - the requested hostname, or undefined if it is not yet available
     *
     * @remarks
     * This function should return the external, world accessible name if there is no cluster/internal only name.
     * The function should throw an error if an external name is requested, but no name/address is available
     * (e.g., the service is internally acessible only.)
     */
    hostname(scope?: NetworkScope): string | undefined;
    /**
     * Returns the TCP or UDP port of the exposed service
     *
     * @remarks
     * Will return undefined if the port information is not yet available
     */
    port(): number | undefined;
}

/**
 * An abstract component that represents a network service.
 */
export abstract class NetworkService extends PrimitiveComponent<NetworkServiceProps> implements NetworkServiceInstance {
    static defaultProps = {
        protocol: "TCP",
        scope: "cluster-internal",
    };

    /**
     * Returns the hostname of the NetworkService, once it is known.
     */
    hostname(scope: NetworkScope): string | undefined {
        const hand = this.props.handle;
        if (!hand) throw new Error(`Internal error: Element props.handle is null`);
        return callNextInstanceMethod(hand, undefined, "hostname", scope);
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
    if (isElement(elemOrProps)) props = elemOrProps.props;
    if (props.targetPort) return props.targetPort;
    if (props.port) return props.port;
    throw new Error(`Cannot compute target port for props ${props}`);
}

export function isNetworkServiceElement(el: AdaptElement): el is AdaptElement<NetworkServiceProps> {
    return el.componentType as any === NetworkService;
}
