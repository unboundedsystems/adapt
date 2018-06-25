import Adapt, { Style } from "@usys/adapt";

import {
    Compute, ComputeProps,
    Container, ContainerProps,
    DockerHost, DockerHostProps,
    LocalCompute, LocalContainer, LocalDockerHost,
} from "../../src";

const localStyle =
    <Style>
        {Compute} {Adapt.rule<ComputeProps>((props) => {
            return <LocalCompute {...props}/>;
        })}

        {DockerHost} {Adapt.rule<DockerHostProps>((props, info) => {
            if (props.dockerHost) return info.origBuild(props);
            return <LocalDockerHost />;
        })}

        {Container} {Adapt.rule<ContainerProps>((props) => {
            return <LocalContainer {...props} />;
        })}
    </Style>;
export default localStyle;
