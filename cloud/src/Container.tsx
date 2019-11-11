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

import { AdaptElement, Handle, isHandle, PrimitiveComponent, useMethod } from "@adpt/core";
import { FIXME_NeedsProperType } from "@adpt/utils";
import { DockerImageInstance } from "./docker";
import { Environment } from "./env";

/**
 * Description of a network port for a {@link Container}.
 *
 * @remarks
 * See the
 * {@link https://docs.docker.com/engine/api/v1.40/#operation/ContainerCreate | Docker API Reference}
 * for more information.
 * @public
 */
export type PortDescription = string | number;

/**
 * An image for a {@link Container}.
 *
 * @remarks
 * See the
 * {@link https://docs.docker.com/engine/api/v1.40/#operation/ContainerCreate | Docker API Reference}
 * for more information.
 * @public
 */
export type ImageId = string | Handle<DockerImageInstance>;

/**
 * A command to be used when creating a {@link Container}.
 *
 * @remarks
 * See the
 * {@link https://docs.docker.com/engine/api/v1.40/#operation/ContainerCreate | Docker API Reference}
 * for more information.
 * @public
 */
export type Command = string | string[];

/**
 * A set of ports to be bound for a {@link Container}.
 *
 * @remarks
 * See the
 * {@link https://docs.docker.com/engine/api/v1.40/#operation/ContainerCreate | Docker API Reference}
 * for more information.
 * @public
 */
export interface PortBinding {
    [ctrPort: number]: number;
    [ctrPort: string]: number;
}

/**
 * Network links to create for a {@link Container}.
 *
 * @remarks
 * See the
 * {@link https://docs.docker.com/engine/api/v1.40/#operation/ContainerCreate | Docker API Reference}
 * for more information.
 * @public
 */
export interface Links {
    [internalName: string]: string;
}

/**
 * Props for the {@link Container} component.
 *
 * @remarks
 * See the
 * {@link https://docs.docker.com/engine/api/v1.40/#operation/ContainerCreate | Docker API Reference}
 * for more information.
 * @public
 */
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

/**
 * State information for a {@link Container}.
 * @public
 */
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

/**
 * Status of a {@link Container}.
 * @public
 */
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
    Config: Config;
    NetworkSettings: ContainerNetworkSettings;
}

/**
 * Config for {@link ContainerStatus}
 * @public
 */
export interface Config {
    Hostname: string;
    Domainname: string;
    User: string;
    AttachStdin: boolean;
    AttachStdout: boolean;
    AttachStderr: boolean;
    Tty: boolean;
    OpenStdin: boolean;
    StdinOnce: boolean;
    Env: string[];
    Cmd: string[];
    ArgsEscaped: boolean;
    Image: string;
    Volumes: FIXME_NeedsProperType;
    WorkingDir: string;
    Entrypoint: FIXME_NeedsProperType;
    OnBuild: FIXME_NeedsProperType;
    Labels: ContainerLabels;
    StopSignal: FIXME_NeedsProperType;
    ExposedPorts: null | { [port: string]: {} };
}

/**
 * Labels for a {@link Container}
 * @public
 */
export interface ContainerLabels {
    [name: string]: string;
}

/**
 * NetworkSettings for {@link ContainerStatus}
 * @public
 */
export interface ContainerNetworkSettings {
    Bridge: FIXME_NeedsProperType;
    SandboxID: string;
    HairpinMode: boolean;
    LinkLocalIPv6Address: string;
    LinkLocalIPv6PrefixLen: number;
    Ports: FIXME_NeedsProperType;
    SandboxKey: string;
    SecondaryIPAddresses: FIXME_NeedsProperType;
    SecondaryIPv6Addresses: FIXME_NeedsProperType;
    EndpointID: string;
    Gateway: string;
    GlobalIPv6Address: string;
    GlobalIPv6PrefixLen: number;
    IPAddress: string;
    IPPrefixLen: number;
    IPv6Gateway: string;
    MacAddress: string;
    Networks: { [name: string]: ContainerNetwork };
}

/**
 * Network for {@link ContainerStatus}
 * @public
 */
export interface ContainerNetwork {
    IPAMConfig: FIXME_NeedsProperType;
    Links: FIXME_NeedsProperType;
    Aliases: FIXME_NeedsProperType;
    NetworkID: string;
    EndpointID: string;
    Gateway: string;
    IPAddress: string;
    IPPrefixLen: number;
    IPv6Gateway: string;
    GlobalIPv6Address: string;
    GlobalIPv6PrefixLen: number;
    MacAddress: string;
    DriverOpts: FIXME_NeedsProperType;
}

/**
 * Abstract component representing a container.
 * @public
 */
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
    static displayName = "cloud.Container";
}
export default Container;

/**
 * Function to check whether an {@link @adpt/core#AdaptElement} is an
 * abstract {@link Container}.
 * @public
 */
export function isContainerElement(el: AdaptElement): el is AdaptElement<ContainerProps> {
    return el.componentType as any === Container;
}

/**
 * Hook function to translate an {@link ImageId} (which can be either a
 * Handle or an image name string) into an image name string.
 * @beta
 */
export function useLatestImageFrom(source: ImageId): string | undefined {
    // useMethod hook must be called unconditionally, even if source isn't a handle
    const hand = isHandle(source) ? source : null;
    const image = useMethod(hand, "latestImage");
    if (image && !image.nameTag) throw new Error(`Built image info has no nameTag`);
    return (typeof source === "string") ? source :
        image ? image.nameTag :
            undefined;
}
