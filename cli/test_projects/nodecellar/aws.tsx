import Adapt, { rule, Style } from "@usys/adapt";
import {
    aws,
    Compute,
    ComputeProps,
    Container,
    ContainerProps,
    DockerHost,
    DockerHostProps,
    LocalContainer,
    LocalDockerHost,
} from "@usys/cloud";
const {
    awsDefaultCredentialsContext,
    EC2Instance,
} = aws;

const creds: aws.AwsCredentialsProps = {
    awsAccessKeyId: "access key",
    awsSecretAccessKey: "secret key",
};

export const awsStyle =
    <Style>
        {Compute} {rule<ComputeProps>((props) => (
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

        {DockerHost} {rule<DockerHostProps>((props, info) => {
            if (props.dockerHost) return info.origBuild(props);
            return <LocalDockerHost />;
        })}

        {Container} {rule<ContainerProps>((props) => {
            return <LocalContainer {...props} />;
        })}
    </Style>;
export default awsStyle;
