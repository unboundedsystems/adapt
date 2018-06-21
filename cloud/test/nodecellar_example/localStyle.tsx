import unbs, { Style } from "@usys/adapt";

import {
    Compute, ComputeProps,
    Container, ContainerProps,
    DockerHost, DockerHostProps,
    LocalCompute, LocalContainer, LocalDockerHost,
} from "../../src";

const localStyle =
    <Style>
        {Compute} {unbs.rule<ComputeProps>((props) => {
            return <LocalCompute {...props}/>;
        })}

        {DockerHost} {unbs.rule<DockerHostProps>((props, info) => {
            if (props.dockerHost) return info.origBuild(props);
            return <LocalDockerHost />;
        })}

        {Container} {unbs.rule<ContainerProps>((props) => {
            return <LocalContainer {...props} />;
        })}
    </Style>;
export default localStyle;
