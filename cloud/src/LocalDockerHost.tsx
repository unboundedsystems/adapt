import { PrimitiveComponent } from "@adpt/core";
import { DockerHostProps } from "./DockerHost";

export class LocalDockerHost extends PrimitiveComponent<DockerHostProps> {
    updateState(state: any) {
        state.dockerHost = "unix:///var/run/docker.sock";
    }
}
export default LocalDockerHost;
