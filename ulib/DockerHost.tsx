import unbs, {
    Component,
    MustReplaceError,
    PrimitiveComponent,
    UnbsNode
} from "../src";

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

export default class DockerHost extends Component<DockerHostProps> {
    build(): UnbsNode {
        if (this.props.dockerHost) {
            return <ExternalDockerHost dockerHost={this.props.dockerHost} />;
        }

        throw new MustReplaceError();
    }
}
