import { Component, WithChildren } from "@usys/adapt";

export interface ServiceProps extends WithChildren {
    name?: string;
}

/**
 * An abstract component that represents a group of components that
 * implements a service. Note that this is not necessarily a network
 * service, but will often be.
 */
export abstract class Service extends Component<ServiceProps, {}> {
}
export default Service;
