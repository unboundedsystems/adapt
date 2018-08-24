import Adapt, { rule, Style } from "@usys/adapt";
import {
    Compute,
    ComputeProps,
    Container,
    ContainerProps,
    DockerHost,
    DockerHostProps,
    LocalCompute,
    LocalContainer,
    LocalDockerHost,
} from "@usys/cloud";

export const localStyle =
    <Style>
        {Compute} {rule<ComputeProps>((props) => {
            return <LocalCompute {...props}/>;
        })}

        {DockerHost} {rule<DockerHostProps>((props, info) => {
            if (props.dockerHost) return info.origBuild(props);
            return <LocalDockerHost />;
        })}

        {Container} {rule<ContainerProps>((props) => {
            return <LocalContainer {...props} />;
        })}
    </Style>;
export default localStyle;
