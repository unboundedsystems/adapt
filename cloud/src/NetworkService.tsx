import {
    AdaptElement,
    AnyProps,
    Handle,
    isElement,
    PrimitiveComponent,
    WithChildren,
} from "@adpt/core";
import { callNextInstanceMethod } from "./hooks";

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
