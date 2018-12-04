import { Component, } from "@usys/adapt";
import { FIXME_NeedsProperType, } from "@usys/utils";

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
    stopSignal?: string;
    tty?: boolean;
    command?: Command;
    portBindings?: PortBinding;
    environment?: Environment;
    links?: Links;
    entrypoint?: Command;
    workingDir?: string;
}

export interface ContainerState {
    Status: string;
    Running: boolean;
    Paused: boolean;
    Restarting: boolean;
    OOMKilled: boolean;
    Dead: boolean;
    Pid: number;
    ExitCode: number;
    Error: string;
    StartedAt: string;
    FinishedAt: string;
}

export interface ContainerStatus {
    Id: string;
    Created: string;
    Path: string;
    Args: string[];
    State: ContainerState;
    Image: string;
    ResolvConfPath: string;
    HostnamePath: string;
    HostsPath: string;
    Node: FIXME_NeedsProperType;
    Name: string;
    RestartCount: number;
    Driver: string;
    MountLabel: string;
    ProcessLabel: string;
    AppArmorProfile: string;
    ExecIDs: string;
    HostConfig: FIXME_NeedsProperType;
    GraphDriver: FIXME_NeedsProperType;
    SizeRw: number;
    SizeRootFs: number;
    Mounts: FIXME_NeedsProperType[];
    Config: FIXME_NeedsProperType;
    NetworkSettings: FIXME_NeedsProperType;
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
