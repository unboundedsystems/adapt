import Adapt, { rule, Style } from "@adpt/core";
import {
    Compute,
    ComputeProps,
    Container,
    ContainerProps,
    DockerHost,
    DockerHostProps,
    LocalCompute,
    NetworkService,
    NetworkServiceProps,
} from "@adpt/cloud";
import { AnsibleContainer, AnsibleDockerHost } from "@adpt/cloud/ansible";

export const localStyle =
    <Style>
        {Compute} {rule<ComputeProps>(({handle, ...props}) => {
            return <LocalCompute {...props}/>;
        })}

        {DockerHost} {rule<DockerHostProps>(({handle, ...props}, info) => {
            return <AnsibleDockerHost ansibleHost={{
                ansible_connection: "local"
            }} {...props} />;
        })}

        {Container} {rule<ContainerProps>(({handle, ...props}) => {
            return <AnsibleContainer {...props} dockerHost="unix:///var/run/docker.sock" />;
        })}

        {NetworkService} {rule<NetworkServiceProps>((props) => (
            null
        ))}
    </Style>;
export default localStyle;
