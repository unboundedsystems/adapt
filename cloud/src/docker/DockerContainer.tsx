/*
 * Copyright 2019 Unbounded Systems, LLC
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
    BuildData,
    callInstanceMethod,
    ChangeType,
    gql,
    Handle,
    isHandle,
    NoStatus,
    ObserveForStatus
} from "@adpt/core";
import { InternalError, MultiError, sha256hex } from "@adpt/utils";
import { difference, intersection, isEqual, isError, pickBy } from "lodash";
import { Action, ActionContext, ShouldAct } from "../action";
import { ContainerLabels, ContainerStatus } from "../Container";
import {
    dockerImageId,
    dockerInspect,
    dockerNetworkConnect,
    dockerNetworkDisconnect,
    dockerNetworks,
    dockerRm,
    dockerRun,
    dockerStop,
    InspectReport} from "./cli";
import { DockerObserver } from "./docker_observer";
import { DockerImageInstance } from "./DockerImage";
import { adaptDockerDeployIDKey } from "./labels";
import { DockerContainerProps, DockerGlobalOptions, ImageInfo } from "./types";

/** @public */
export interface DockerContainerStatus extends ContainerStatus { }

interface ContainerInfo {
    name: string;
    data?: InspectReport;
}

/**
 * Compute a unique name for the container
 *
 * @internal
 */
export function computeContainerName(id: string, deployID: string) {
    return "adapt-" + sha256hex(id + "-" + deployID);
}

function computeContainerNameFromBuildData(buildData: BuildData) {
    return computeContainerName(buildData.id, buildData.deployID);
}

function computeContainerNameFromContext(context: ActionContext): string {
    return computeContainerNameFromBuildData(context.buildData);
}

async function fetchContainerInfo(context: ActionContext, props: DockerContainerProps): Promise<ContainerInfo> {
    const name = computeContainerNameFromContext(context);
    const inspect = await dockerInspect([name], { type: "container", dockerHost: props.dockerHost });
    if (inspect.length > 1) throw new Error(`Multiple containers match single name: ${name}`);
    const info = {
        name,
        data: inspect[0] //will be undefined if no container found
    };
    return info;
}

function containerExists(info: ContainerInfo) { return info.data !== undefined; }

function containerExistsAndIsFromDeployment(info: ContainerInfo, context: ActionContext): boolean {
    if (info.data === undefined) return false;
    if (info.data.Config.Labels &&
        info.data.Config.Labels[adaptDockerDeployIDKey] === context.buildData.deployID) return true;
    return false;
}

async function getImageId(source: string | Handle<DockerImageInstance>,
    props: DockerContainerProps): Promise<string | undefined> {

    if (isHandle(source)) {
        const image = callInstanceMethod<ImageInfo | undefined>(source, undefined, "latestImage");
        if (!image) return undefined;
        return image.id;
    } else {
        return dockerImageId(source, { dockerHost: props.dockerHost });
    }
}

function arraysHaveSameElements(x: any[], y: any[]): boolean {
    if (x.length !== y.length) return false;
    return intersection([x, y]).length !== x.length;
}

function userLabels(labels: ContainerLabels) {
    return pickBy(labels, (_: unknown, key: string) => key !== adaptDockerDeployIDKey);
}

async function containerIsUpToDate(info: ContainerInfo, context: ActionContext, props: DockerContainerProps):
    Promise<"noExist" | "replace" | "update" | "existsUnmanaged" | "upToDate"> {
    if (!containerExists(info)) return "noExist";
    if (!containerExistsAndIsFromDeployment(info, context)) return "existsUnmanaged";
    if (!info.data) throw new Error(`Container exists, but no info.data??: ${info}`);
    if (await getImageId(props.image, props) !== info.data.Image) return "replace";
    if (!isEqual(props.labels || {}, userLabels(info.data.Config.Labels))) return "replace";
    let desiredNetworks = props.networks;
    if (desiredNetworks === undefined) {
        const defaultNetwork = await dockerDefaultNetwork(props);
        desiredNetworks = defaultNetwork === undefined ? [] : [defaultNetwork];
    }
    if (!arraysHaveSameElements(desiredNetworks, Object.keys(info.data.NetworkSettings.Networks))) return "update";

    return "upToDate";
}

/**
 * Returns the name of the default docker network
 *
 * @returns the name of the default docker network, undefined if it does not exist
 * @internal
 */
async function dockerDefaultNetwork(opts: DockerGlobalOptions): Promise<string | undefined> {
    const networks = await dockerNetworks(opts);
    for (const net of networks) {
        if (net.Options["com.docker.network.bridge.default_bridge"] === "true") return net.Name;
    }
    return undefined;
}

/**
 * Update a container described in info to match props that are updateable
 *
 * @remarks
 * Note that this will only update props that are updateable.  If there is a non-updateable change,
 * it will not take effect.  This should only be used if `containerIsUpToDate` returns `"update"` for info
 * and props.
 *
 * @internal
 */
async function updateContainer(info: ContainerInfo, _context: ActionContext, props: DockerContainerProps):
    Promise<void> {
    //Networks
    if (!info.data) throw new Error(`No data for container??: ${info}`);
    const existingNetworks = Object.keys(info.data.NetworkSettings.Networks);
    let networks = props.networks;
    if (networks === undefined) {
        const defaultNetwork = await dockerDefaultNetwork(props);
        networks = defaultNetwork === undefined ? [] : [defaultNetwork];
    }
    const toDisconnect = difference(existingNetworks, networks);
    const toConnect = difference(networks, existingNetworks);
    await dockerNetworkConnect(info.name, toConnect, { ...props, alreadyConnectedError: false });
    await dockerNetworkDisconnect(info.name, toDisconnect, { ...props, alreadyDisconnectedError: false });
}

async function stopAndRmContainer(
    _context: ActionContext,
    info: ContainerInfo,
    props: DockerContainerProps): Promise<void> {

    if (!info.data) return;
    await dockerStop([info.data.Id], { dockerHost: props.dockerHost });
    try {
        await dockerRm([info.data.Id], { dockerHost: props.dockerHost });
    } catch (err) {
        // If autoRemove is set, container may not exist
        if (err.message && /No such container/.test(err.message)) return;
        throw err;
    }
}

function getImageNameOrId(props: DockerContainerProps): string | undefined {
    const source = props.image;
    if (isHandle(source)) {
        const image = callInstanceMethod<ImageInfo | undefined>(source, undefined, "latestImage");
        if (!image) return undefined;
        if (image.nameTag) return image.nameTag;
        return image.id;
    } else {
        return source;
    }
}

async function runContainer(context: ActionContext, props: DockerContainerProps): Promise<void> {
    const image = getImageNameOrId(props);
    const name = computeContainerNameFromContext(context);
    if (image === undefined) return;
    const { networks, ...propsNoNetworks } = props;
    const opts = {
        ...propsNoNetworks,
        name,
        image,
        labels: {
            ...(props.labels || {}),
            [adaptDockerDeployIDKey]: `${context.buildData.deployID}`
        },
        network: (networks && networks[0]) || undefined
    };
    await dockerRun(opts);
    if (networks && networks.length > 1) {
        const remainingNetworks = networks.slice(1);
        await dockerNetworkConnect(name, remainingNetworks, { ...props });
    }
}

/**
 * State for DockerContainer
 * @internal
 */
class DockerContainerState {
    info?: ContainerInfo;
}

/**
 * Component to instantiate an image container with docker
 *
 * @remarks
 * See {@link docker.DockerContainerProps}.
 *
 * @public
 */
export class DockerContainer extends Action<DockerContainerProps, DockerContainerState> {
    static defaultProps = {
        dockerHost: process.env.DOCKER_HOST
    };

    /** @internal */
    async shouldAct(op: ChangeType, context: ActionContext): Promise<false | ShouldAct> {
        const containerInfo = await fetchContainerInfo(context, this.props);
        const displayName = this.displayName(context);
        switch (op) {
            case "none": return false;
            case "modify":
            case "replace":
            case "create":
                switch (await containerIsUpToDate(containerInfo, context, this.props)) {
                    case "noExist":
                        return { act: true, detail: `Creating container ${displayName}` };
                    case "replace":
                        return { act: true, detail: `Replacing container ${displayName}` };
                    case "update":
                        return { act: true, detail: `Updating container ${displayName}` };
                    case "existsUnmanaged":
                        throw new Error(`Container ${containerInfo.name} already exstis,`
                            + ` but is not part of this deployment: ${containerInfo}`);
                    case "upToDate":
                        return false;
                    default:
                        throw new InternalError(`Unhandled ChangeType in DockerContainer`);
                }

            case "delete":
                return containerExistsAndIsFromDeployment(containerInfo, context)
                    ? { act: true, detail: `Deleting container ${displayName}` }
                    : false;
        }
        return false;
    }

    /** @internal */
    async action(op: ChangeType, context: ActionContext): Promise<void> {
        const oldInfo = await fetchContainerInfo(context, this.props);
        switch (op) {
            case "none": return;
            case "modify":
                const status = await containerIsUpToDate(oldInfo, context, this.props);
                if (status === "update") {
                    await updateContainer(oldInfo, context, this.props);
                    break;
                }
            //Fallthrough
            case "replace":
                //FIXME(manishv) Is there a bug here where this will throw if the container
                //is deleted between shouldAct and action?  Do we care about this?
                await stopAndRmContainer(context, oldInfo, this.props);
            // Fallthrough
            case "create":
                await runContainer(context, this.props);
                const info = await fetchContainerInfo(context, this.props);
                this.setState({ info });
                return;
            case "delete":
                await stopAndRmContainer(context, oldInfo, this.props);
                this.setState({ info: undefined });
        }
    }

    async status(observe: ObserveForStatus, buildData: BuildData) {
        return containerStatus(observe, computeContainerNameFromBuildData(buildData), this.props.dockerHost);
    }

    /**
     * Get the IP address of the container, optionally for a specific Docker
     * network.
     * @remarks
     * The IP addresses that are returned by this function are valid only
     * on the associated Docker network, which is often only associated
     * with a single host node for most Docker network types.
     *
     * @param network - Name of a Docker network. If `network` is provided
     * and the container is connected to the network with an IP address, that
     * address will be returned. If the container is not connected to the
     * network, `undefined` will be returned. If `network` is not provided,
     * the default container IP address will be returned.
     *
     * @beta
     */
    async dockerIP(network?: string) {
        if (!this.state.info || !this.state.info.data) return undefined;
        const stat = this.state.info.data;
        if (!network) return stat.NetworkSettings.IPAddress;
        const netStat = stat.NetworkSettings.Networks[network];
        if (!netStat) return undefined;
        return netStat.IPAddress;
    }

    /** @internal */
    initialState() { return {}; }

    private displayName(context: ActionContext) {
        const name = computeContainerNameFromContext(context);
        return `'${this.props.key}' (${name})`;
    }
}
export default DockerContainer;

/**
 * Compute the status of a container based on a graphQL schema
 *
 * @internal
 */
export async function containerStatus(
    observe: ObserveForStatus,
    containerName: string,
    dockerHost: string): Promise<ContainerStatus | NoStatus> {

    try {
        const obs: any = await observe(DockerObserver, gql`
            query ($name: String!, $dockerHost: String!) {
                withDockerHost(dockerHost: $dockerHost) {
                    ContainerInspect(id: $name) @all(depth: 10)
                }
            }`,
            {
                name: containerName,
                dockerHost,
            }
        );
        return obs.withDockerHost.ContainerInspect;

    } catch (err) {
        if (!isError(err)) throw err;
        if (err instanceof MultiError &&
            err.errors.length === 1 &&
            err.errors[0].message &&
            err.errors[0].message.startsWith("No such container")) {
            return { noStatus: err.errors[0].message };
        }
        return { noStatus: err.message };
    }
}
