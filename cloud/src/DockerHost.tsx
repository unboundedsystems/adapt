import Adapt, {
    AdaptElementOrNull,
    BuildNotImplemented,
    Component,
    PrimitiveComponent
} from "@usys/adapt";

export interface ExternalDockerHostProps {
    dockerHost: string;
}

export class ExternalDockerHost extends PrimitiveComponent<ExternalDockerHostProps> {
    updateState(state: any) {
        state.dockerHost = this.props.dockerHost;
    }
}

export interface DockerHostProps {
    dockerHost?: string;
}

export class DockerHost extends Component<DockerHostProps> {
    build(): AdaptElementOrNull {
        if (this.props.dockerHost) {
            return <ExternalDockerHost dockerHost={this.props.dockerHost} />;
        }

        throw new BuildNotImplemented();
    }
}
export default DockerHost;
