import { Component } from "@usys/adapt";

export type PortDescription = string | number;

export type ImageId = string;

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

    autoRemove?: boolean;
    ports?: PortDescription[];
    stdinOpen?: boolean;
    tty?: boolean;
    command?: Command;
    portBindings?: PortBinding;
    environment?: Environment;
    links?: Links;
    entrypoint?: Command;
    workingDir?: string;
}

export abstract class Container extends Component<ContainerProps, {}> {
    static defaultProps = {
        autoRemove: true,
        ports: [],
        stdinOpen: false,
        tty: false,
        portBindings: {},
        environment: {},
        links: {},
    };
}
export default Container;
