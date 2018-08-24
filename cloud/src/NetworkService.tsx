import { Component, WithChildren } from "@usys/adapt";

export type ServicePort = number | string;

export interface NetworkServiceProps extends WithChildren {
    ip?: string;
    name?: string;
    port: ServicePort;
    protocol?: string;
}

export abstract class NetworkService extends Component<NetworkServiceProps, {}> {
    static defaultProps = {
        protocol: "TCP",
    };
}
export default NetworkService;
