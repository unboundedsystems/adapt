import {
    ansible,
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
import Adapt, { rule, Style } from "@adpt/core";

export const localStyle =
    <Style>
        {Compute} {rule<ComputeProps>(({handle, ...props}) => {
            return <LocalCompute {...props}/>;
        })}

        {DockerHost} {rule<DockerHostProps>(({handle, ...props}, info) => {
            return <ansible.AnsibleDockerHost ansibleHost={{
                ansible_connection: "local"
            }} {...props} />;
        })}

        {Container} {rule<ContainerProps>(({handle, ...props}) => {
            return <ansible.Container {...props} dockerHost="unix:///var/run/docker.sock" />;
        })}

        {NetworkService} {rule<NetworkServiceProps>((props) => (
            null
        ))}
    </Style>;
export default localStyle;
