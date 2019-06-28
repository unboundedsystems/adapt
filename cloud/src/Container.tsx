import { AdaptElement, PrimitiveComponent, } from "@adpt/core";
import { FIXME_NeedsProperType, } from "@adpt/utils";

export type PortDescription = string | number;

export type ImageId = string;

export type Command = string | string[];

export interface EnvPair {
    name: string;
    value: string;
}
export type EnvPairs = EnvPair[];

export interface EnvSimple {
    [key: string]: string;
}

export type Environment = EnvPair[] | EnvSimple;

export interface PortBinding {
    [ctrPort: number]: number;
    [ctrPort: string]: number;
}

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
    imagePullPolicy?: "Always" | "Never" | "IfNotPresent";
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

export abstract class Container extends PrimitiveComponent<ContainerProps> {
    static defaultProps = {
        dockerHost: "unix:///var/run/docker.sock",
        autoRemove: true,
        ports: [],
        stdinOpen: false,
        tty: false,
        portBindings: {},
        environment: {},
        links: {},
        imagePullPolicy: "IfNotPresent",
    };
}
export default Container;

export function isContainerElement(el: AdaptElement): el is AdaptElement<ContainerProps> {
    return el.componentType as any === Container;
}

export function mergeEnvPairs(...envs: (Environment | undefined)[]): EnvPairs | undefined {
    let ret: EnvPairs | undefined;
    envs.forEach((e) => {
        if (!e) return;
        if (!ret) ret = [];
        ret = ret.concat(Array.isArray(e) ? e :
            Object.keys(e).map((name) => ({ name, value: e[name] })));
    });
    return ret;
}

export function mergeEnvSimple(...envs: (Environment | undefined)[]): EnvSimple | undefined {
    let ret: EnvSimple | undefined;
    envs.forEach((e) => {
        if (!e) return;
        if (!ret) ret = {};
        if (Array.isArray(e)) {
            e.forEach((pair) => (ret as EnvSimple)[pair.name] = pair.value);
        } else {
            Object.assign(ret, e);
        }
    });
    return ret;
}
