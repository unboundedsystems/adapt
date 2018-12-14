import { AdaptElement, AnyProps, Component, Handle, isElement, WithChildren } from "@usys/adapt";

export type ServicePort = number | string;

export interface NetworkServiceProps extends WithChildren {
    ip?: string;
    name?: string;
    port: ServicePort;
    protocol?: string;
    targetPort?: ServicePort;
    endpoint?: Handle;
}

export abstract class NetworkService extends Component<NetworkServiceProps, {}> {
    static defaultProps = {
        protocol: "TCP",
    };
}

export function targetPort(elemOrProps: NetworkServiceProps | AdaptElement): ServicePort {
    let props: AnyProps = elemOrProps;
    if (isElement(elemOrProps))props = elemOrProps.props;
    if (props.targetPort) return props.targetPort;
    if (props.port) return props.port;
    throw new Error(`Cannot compute target port for props ${props}`);
}

export default NetworkService;
