import { Component, gql, NoStatus, ObserveForStatus } from "@usys/adapt";
import { MultiError } from "@usys/utils";
import { isError } from "lodash";
import { Container, ContainerProps, ContainerStatus } from "../Container";
import { DockerObserver } from "./docker_observer";

export interface DockerContainerProps extends ContainerProps { }
export interface DockerContainerStatus extends ContainerStatus { }

export abstract class DockerContainer extends Component<DockerContainerProps, {}> {
    static defaultProps = Container.defaultProps;

    async status(observe: ObserveForStatus) {
        return containerStatus(observe, this.props.name, this.props.dockerHost!);
    }
}
export default DockerContainer;

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
