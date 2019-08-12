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
import { isError } from "lodash";
import { Action, ActionContext, ShouldAct } from "../action";
import { ContainerStatus } from "../Container";
import {
    dockerImageId,
    dockerInspect,
    dockerRm,
    dockerRun,
    dockerStop,
    InspectReport
} from "./cli";
import { DockerObserver } from "./docker_observer";
import { DockerImageInstance } from "./DockerImage";
import { DockerContainerProps, ImageInfo } from "./types";

/**
 * The base string used for Docker container labels.
 * @internal
 */
export const adaptDockerKey = "io.adpt"; //FIXME(manishv) is this what we want?
/**
 * Docker container label for the deployID the container was created from.
 * @internal
 */
export const adaptDockerDeployIDKey = adaptDockerKey + ".deployID";

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

async function containerIsUpToDate(info: ContainerInfo, context: ActionContext, props: DockerContainerProps):
    Promise<"noExist" | "stale" | "existsUnmanaged" | "upToDate"> {
    if (!containerExists(info)) return "noExist";
    if (!containerExistsAndIsFromDeployment(info, context)) return "existsUnmanaged";
    if (!info.data) throw new Error(`Container exists, but no info.data??: ${info}`);
    if (await getImageId(props.image, props) !== info.data.Image) return "stale";

    return "upToDate";
}

async function stopAndRmContainer(
    _context: ActionContext,
    info: ContainerInfo,
    props: DockerContainerProps): Promise<void> {

    if (!info.data) return;
    await dockerStop([info.data.Id], { dockerHost: props.dockerHost });
    return dockerRm([info.data.Id], { dockerHost: props.dockerHost });
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
    if (image === undefined) return;
    const opts = {
        ...props,
        name: computeContainerNameFromContext(context),
        image,
        labels: {
            ...(props.labels || {}),
            [adaptDockerDeployIDKey]: `${context.buildData.deployID}`
        }
    };

    return dockerRun(opts);
}

/**
 * Component to instantiate an image container with docker
 *
 * @remarks
 * See {@link docker.DockerContainerProps}.
 *
 * @public
 */
export class DockerContainer extends Action<DockerContainerProps, {}> {
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
                    case "stale":
                        return { act: true, detail: `Replacing container ${displayName}` };
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
            case "replace":
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
