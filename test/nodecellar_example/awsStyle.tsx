import unbs, { Style, } from "../../src";

import Compute, { ComputeProps } from "../../ulib/Compute";
import Container, { ContainerProps } from "../../ulib/Container";
import DockerHost, { DockerHostProps } from "../../ulib/DockerHost";

import { AwsCredentialsProps, awsDefaultCredentialsContext } from "../../ulib/deploy/aws/credentials";
import EC2Instance from "../../ulib/deploy/aws/EC2Instance";
import LocalContainer from "../../ulib/deploy/local/LocalContainer";
import LocalDockerHost from "../../ulib/deploy/local/LocalDockerHost";

const creds: AwsCredentialsProps = {
    awsAccessKeyId: "access key",
    awsSecretAccessKey: "secret key",
};

const awsStyle =
    <Style>
        {Compute} {unbs.rule<ComputeProps>((props) => (
            <awsDefaultCredentialsContext.Provider value={creds}>
                <EC2Instance
                    imageId="someimage"
                    instanceType="t2.micro"
                    name="docker-host"
                    regionName="us-west-2"
                    {...props}
                />
            </awsDefaultCredentialsContext.Provider>
        ))}

        {DockerHost} {unbs.rule<DockerHostProps>((props, info) => {
            if (props.dockerHost) return info.origBuild(props);
            return <LocalDockerHost />;
        })}

        {Container} {unbs.rule<ContainerProps>((props) => {
            return <LocalContainer {...props} />;
        })}
    </Style>;
export default awsStyle;
