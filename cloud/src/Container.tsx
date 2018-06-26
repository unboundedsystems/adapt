import { Component } from "@usys/adapt";

export type PortDescription = string | number;

export interface ImageId {
    repository: string;
    tag?: string;
}

export type Command = string | string[];

export interface Environment {
    [key: string]: string;
}

export interface PortBindingString {
    [ctrPort: string]: number;
}
export interface PortBindingNumber {
    [ctrPort: number]: number;
}
export type PortBinding = PortBindingString | PortBindingNumber;

export interface Links {
    [internalName: string]: string;
}

export interface ContainerProps {
    name: string;
    dockerHost: string;
    image: ImageId;

    ports?: PortDescription[];
    stdinOpen?: boolean;
    tty?: boolean;
    command?: Command;
    portBindings?: PortBinding;
    environment?: Environment;
    links?: Links;
}

export abstract class Container extends Component<ContainerProps> {
    static defaultProps = {
        ports: [],
        stdinOpen: false,
        tty: false,
        portBindings: {},
        environment: {},
        links: {},
    };
}
export default Container;