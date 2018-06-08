import { PrimitiveComponent } from "../../../src";
import { DockerHostProps } from "../../DockerHost";

export default class LocalDockerHost extends PrimitiveComponent<DockerHostProps> {
    updateState(state: any) {
        state.dockerHost = "unix:///var/run/docker.sock";
    }
}
