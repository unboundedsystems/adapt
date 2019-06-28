import Adapt, { Style } from "@adpt/core";

import {
    Compute, ComputeProps,
    Container, ContainerProps,
    DockerHost, DockerHostProps,
    LocalCompute, LocalContainer, LocalDockerHost,
} from "../../src";

const localStyle =
    <Style>
        {Compute} {Adapt.rule<ComputeProps>(({handle, ...props}) => {
            return <LocalCompute {...props}/>;
        })}

        {DockerHost} {Adapt.rule<DockerHostProps>((props, info) => {
            if (props.dockerHost) return info.origBuild(props);
            return <LocalDockerHost key={props.key}/>;
        })}

        {Container} {Adapt.rule<ContainerProps>(({handle, ...props}) => {
            return <LocalContainer {...props} />;
        })}
    </Style>;
export default localStyle;
