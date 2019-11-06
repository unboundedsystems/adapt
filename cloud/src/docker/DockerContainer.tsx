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
import { InternalError, MultiError } from "@adpt/utils";
import { isError } from "lodash";
import { inspect } from "util";
import { Action, ActionContext, ShouldAct } from "../action";
import { makeResourceName } from "../common";
import { ContainerLabels, ContainerNetwork, ContainerStatus } from "../Container";
import {
    dockerImageId,
    dockerInspect,
    dockerNetworkConnect,
    dockerNetworkDisconnect,
    dockerNetworks,
    dockerRm,
    dockerRun,
    dockerStop,
    InspectReport
} from "./cli";
import { DockerObserver } from "./docker_observer";
import { DockerImageInstance } from "./DockerImage";
import { adaptDockerDeployIDKey } from "./labels";
import { containerNetworks, NetworkDiff } from "./network_set";
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
export const computeContainerName = makeResourceName(/[^a-z-.]/g, 63);

function computeContainerNameFromBuildData(props: { key?: string }, buildData: BuildData): string {
    if (!props.key) throw new InternalError(`DockerContainer with id '${buildData.id}' has no key`);
    return computeContainerName(props.key, buildData.id, buildData.deployID);
}

function computeContainerNameFromContext(props: { key?: string }, context: ActionContext): string {
    return computeContainerNameFromBuildData(props, context.buildData);
}

async function fetchContainerInfo(context: ActionContext,
    props: DockerContainerProps & { key?: string }): Promise<ContainerInfo> {
    const name = computeContainerNameFromContext(props, context);
    const insp = await dockerInspect([name], { type: "container", dockerHost: props.dockerHost });
    if (insp.length > 1) throw new Error(`Multiple containers match single name: ${name}`);
    const info = {
        name,
        data: insp[0] //will be undefined if no container found
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
 * The list of networks that a container should be connected to, according
 * to its props.
 * @internal
 */
async function requestedNetworks(props: DockerContainerProps): Promise<string[]> {
    if (props.networks) return props.networks;
    const defaultNetwork = await dockerDefaultNetwork(props);
    return defaultNetwork ? [ defaultNetwork ] : [];
}

/**
 * Computes the differences between a container's requested networks and
 * its actual networks.
 *
 * @remarks
 * This function uses `NetworkSet` to attempt to minimize the number of
 * inspect requests made to the Docker daemon.
 *
 * When `op` is `"diff"`, returns a `NetworkDiff` object that contains which
 * networks should be added to the container and which should be deleted in
 * order to match what is requested in `props`.
 *
 * When `op` is `"equals"`, returns `true` to indicate the container's
 * networks are equal to the requested networks in `props`, otherwise `false`.
 * @internal
 */
async function networkDiff(info: ContainerInfo, props: DockerContainerProps, op: "equals"): Promise<boolean>;
async function networkDiff(info: ContainerInfo, props: DockerContainerProps, op: "diff"): Promise<NetworkDiff>;
async function networkDiff(info: ContainerInfo, props: DockerContainerProps, op: "diff" | "equals") {
    async function resolver(names: string[]) {
        const infos = await dockerInspect(names, { ...props, type: "network" });
        return infos.map((i) => ({ name: i.Name, id: i.Id }));
    }

    const data = info.data;
    if (!data) throw new InternalError(`No inspect report in networkDiff`);
    const existing = containerNetworks(data);
    const requested = await requestedNetworks(props);

    return existing[op](requested, resolver);
}

/**
 * Ensure all labels in `requested` are in `current` with the requested value.
 * Ignores excess labels in `current`.
 */
function hasLabels(requested: ContainerLabels, current: ContainerLabels) {
    for (const r of Object.keys(requested)) {
        if (current[r] !== requested[r]) return false;
    }
    return true;
}

async function containerIsUpToDate(info: ContainerInfo, context: ActionContext, props: DockerContainerProps):
    Promise<"noExist" | "replace" | "update" | "existsUnmanaged" | "upToDate"> {
    if (!containerExists(info)) return "noExist";
    if (!containerExistsAndIsFromDeployment(info, context)) return "existsUnmanaged";
    if (!info.data) throw new Error(`Container exists, but no info.data??: ${info}`);
    if (await getImageId(props.image, props) !== info.data.Image) return "replace";
    if (!hasLabels(props.labels || {}, info.data.Config.Labels)) return "replace";
    if (!(await networkDiff(info, props, "equals"))) return "update";

    return "upToDate";
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
    const diff = await networkDiff(info, props, "diff");
    await dockerNetworkConnect(info.name, diff.toAdd,
        { ...props, alreadyConnectedError: false });
    await dockerNetworkDisconnect(info.name, diff.toDelete,
        { ...props, alreadyDisconnectedError: false });
}

async function stopAndRmContainer(
    _context: ActionContext,
    info: ContainerInfo,
    props: DockerContainerProps): Promise<void> {

    if (!info.data) return;
    try {
        await dockerStop([info.data.Id], { dockerHost: props.dockerHost });
    } catch (err) {
        // Ignore if it's already stopped
        if (err.message && /No such container/.test(err.message)) return;
        throw err;
    }
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

async function runContainer(context: ActionContext, props: DockerContainerProps & { key?: string }): Promise<void> {
    const image = getImageNameOrId(props);
    const name = computeContainerNameFromContext(props, context);
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

function networkStatus(
    net: string,
    networks: { [name: string]: ContainerNetwork }): ContainerNetwork | undefined {
    if ((net in networks) && (networks[net] !== undefined)) return networks[net];
    for (const name of Object.keys(networks)) {
        if (net === networks[name].NetworkID) return networks[name];
    }
    return undefined;
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
    async shouldAct(diff: ChangeType, context: ActionContext): Promise<false | ShouldAct> {
        const containerInfo = await fetchContainerInfo(context, this.props);
        const displayName = this.displayName(context);
        switch (diff) {
            case "modify":
            case "create":
                const status = await containerIsUpToDate(containerInfo, context, this.props);
                switch (status) {
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
                        throw new InternalError(`Unhandled status '${status}' in DockerContainer`);
                }

            case "delete":
                return containerExistsAndIsFromDeployment(containerInfo, context)
                    ? { act: true, detail: `Deleting container ${displayName}` }
                    : false;

            case "none":
            case "replace":
            default:
                throw new InternalError(`Unhandled ChangeType '${diff}' in DockerContainer`);
        }
    }

    /** @internal */
    async action(diff: ChangeType, context: ActionContext): Promise<void> {
        const oldInfo = await fetchContainerInfo(context, this.props);
        switch (diff) {
            case "modify":
            case "create":
                const status = await containerIsUpToDate(oldInfo, context, this.props);
                if (status === "existsUnmanaged") {
                    throw new Error(`Container ${oldInfo.name} already exstis,`
                        + ` but is not part of this deployment: ${inspect(oldInfo)}`);
                }
                if (status === "upToDate") return;

                if (status === "update") {
                    await updateContainer(oldInfo, context, this.props);
                }
                if (status === "replace") {
                    await stopAndRmContainer(context, oldInfo, this.props);
                }
                if (status === "replace" || status === "noExist") {
                    await runContainer(context, this.props);
                }
                const newInfo = await fetchContainerInfo(context, this.props);
                this.setState({ info: newInfo });
                return;

            case "delete":
                await stopAndRmContainer(context, oldInfo, this.props);
                this.setState({ info: undefined });
                return;

            case "none":
            case "replace":
            default:
                throw new InternalError(`Unhandled ChangeType '${diff}' in DockerContainer`);
        }
    }

    async status(observe: ObserveForStatus, buildData: BuildData) {
        return containerStatus(observe,
            computeContainerNameFromBuildData(this.props, buildData),
            this.props.dockerHost);
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
    dockerIP(network?: string) {
        if (!this.state.info || !this.state.info.data) return undefined;
        const stat = this.state.info.data;
        if (!network) {
            if (stat.NetworkSettings.IPAddress === "") return undefined;
            return stat.NetworkSettings.IPAddress;
        }
        const netStat = networkStatus(network, stat.NetworkSettings.Networks);
        if (!netStat) return undefined;
        if (netStat.IPAddress === "") return undefined;
        return netStat.IPAddress;
    }

    /** @internal */
    initialState() { return {}; }

    private displayName(context: ActionContext) {
        const name = computeContainerNameFromContext(this.props, context);
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
