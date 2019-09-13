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

/**
 * Port for {@link NetworkService }
 * @public
 */
export type ServicePort = number | string;

/**
 * Network service scope used by {@link NetworkService}
 * @public
 */
export type NetworkServiceScope =
    "local" |
    "cluster-internal" |
    "cluster-public" |
    "external";

/**
 * Props for the {@link NetworkService} element
 * @public
 */
export interface NetworkServiceProps extends WithChildren {
    /** IP address of the network service */
    ip?: string;
    /** Name of the network service */
    name?: string;
    /** Port on which clients connect to this service */
    port: ServicePort;
    /** Protocol used by the network service */
    protocol?: string;
    /** Scope of the service */
    scope?: NetworkServiceScope;
    /** Port on the endpoint that provides this service */
    targetPort?: ServicePort;
    /** Endpoint that provides the service */
    endpoint?: Handle;
}

/**
 * Type for various network address scopes
 *
 * @remarks
 * The details of this type are very experimental.  Use the constants `NetworkScope.external`
 * and `NetworkScope.default` instead of strings to reduce the chance of breakage.
 *
 * @beta
 */
export enum NetworkScope {
    external = "external",
    default = "default"
}

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
 *
 * @public
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

/**
 * Computes the target port that will be used for a NetworkService
 *
 * @param elemOrProps - a {@link NetworkService} element or its props
 * @returns The target port of the {@link NetworkService} object
 *
 * @public
 */
export function targetPort(elemOrProps: NetworkServiceProps | AdaptElement): ServicePort {
    let props: AnyProps = elemOrProps;
    if (isElement(elemOrProps)) props = elemOrProps.props;
    if (props.targetPort) return props.targetPort;
    if (props.port) return props.port;
    throw new Error(`Cannot compute target port for props ${props}`);
}

/**
 * Type assertion that tests an element to see if it is a {@link NetworkService}
 *
 * @param el - the element to be tested
 * @returns `true` if  `el` is a NetworkService, `false` otherwise
 *
 * @remarks
 * Also functions as a type assertion for Typescript, so the arguments
 * type will be adjusted to reflect that it is an `AdaptElement<NetworkServiceProps>`
 * instead of a generic `AdaptElement`.
 *
 * @public
 */
export function isNetworkServiceElement(el: AdaptElement): el is AdaptElement<NetworkServiceProps> {
    return el.componentType as any === NetworkService;
}
