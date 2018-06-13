import unbs, { Style, } from "../../src";

import Compute, { ComputeProps } from "../../ulib/Compute";
import Container, { ContainerProps } from "../../ulib/Container";
import DockerHost, { DockerHostProps } from "../../ulib/DockerHost";

import LocalCompute from "../../ulib/cloud/local/LocalCompute";
import LocalContainer from "../../ulib/cloud/local/LocalContainer";
import LocalDockerHost from "../../ulib/cloud/local/LocalDockerHost";

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
