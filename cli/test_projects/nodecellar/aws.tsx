import Adapt, { Group, rule, ruleNoRematch, Style } from "@usys/adapt";
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
    NetworkService,
    NetworkServiceProps,
} from "@usys/cloud";
const {
    awsDefaultCredentialsContext,
    CFStack,
    EC2Instance,
    loadAwsCreds,
} = aws;

/*
 * Real resources in AWS
 * These are actual names/IDs of items that must exist in AWS.
 */

// ami-0411d593eba4708e5 = Ubuntu 16.04.20180814 Xenial us-west-2
export const ubuntuAmi = "ami-0411d593eba4708e5";

// FIXME(mark): Need to figure out how to best handle the SSH keys. This
// key name exists in my account...
export const sshKeyName = "DefaultKeyPair";
// FIXME(mark): The security group can be created as part of each stack.
export const defaultSecurityGroup = "http-https-ssh";

export const awsStyle = loadAwsCreds().then((creds) => (
    <Style>
        {Group} {rule((props, info) => ruleNoRematch(info,
            <Group>
                <awsDefaultCredentialsContext.Provider value={creds}>
                    <CFStack StackName="ci-system-nodecellar">
                        {props.children}
                    </CFStack>
                </awsDefaultCredentialsContext.Provider>
            </Group>
        ))}

        {Compute} {rule<ComputeProps>((props) => (
            <EC2Instance
                imageId={ubuntuAmi}
                instanceType="t2.micro"
                name="docker-host"
                sshKeyName={sshKeyName}
                securityGroups={[defaultSecurityGroup]}
                {...props}
            />
        ))}

        {DockerHost} {rule<DockerHostProps>((props, info) => {
            if (props.dockerHost) return info.origBuild(props);
            return <LocalDockerHost />;
        })}

        {Container} {rule<ContainerProps>((props) => {
            return <LocalContainer {...props} />;
        })}

        {NetworkService} {rule<NetworkServiceProps>((props) => (
            null
        ))}

    </Style>
));
export default awsStyle;
