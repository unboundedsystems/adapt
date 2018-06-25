import * as Adapt from "@usys/adapt";
import * as cloud from "@usys/cloud";

const creds: cloud.AwsCredentialsProps = {
    awsAccessKeyId: "access key",
    awsSecretAccessKey: "secret key",
};

export const localStyle =
    <Adapt.Style>
        {cloud.Compute} {Adapt.rule<cloud.ComputeProps>((props) => {
            return <cloud.LocalCompute {...props}/>;
        })}

        {cloud.DockerHost} {Adapt.rule<cloud.DockerHostProps>((props, info) => {
            if (props.dockerHost) return info.origBuild(props);
            return <cloud.LocalDockerHost />;
        })}

        {cloud.Container} {Adapt.rule<cloud.ContainerProps>((props) => {
            return <cloud.LocalContainer {...props} />;
        })}
    </Adapt.Style>;

export const awsStyle =
    <Adapt.Style>
        {cloud.Compute} {Adapt.rule<cloud.ComputeProps>((props) => (
            <cloud.awsDefaultCredentialsContext.Provider value={creds}>
                <cloud.EC2Instance
                    imageId="someimage"
                    instanceType="t2.micro"
                    name="docker-host"
                    regionName="us-west-2"
                    {...props}
                />
            </cloud.awsDefaultCredentialsContext.Provider>
        ))}

        {cloud.DockerHost} {Adapt.rule<cloud.DockerHostProps>((props, info) => {
            if (props.dockerHost) return info.origBuild(props);
            return <cloud.LocalDockerHost />;
        })}

        {cloud.Container} {Adapt.rule<cloud.ContainerProps>((props) => {
            return <cloud.LocalContainer {...props} />;
        })}
    </Adapt.Style>;
