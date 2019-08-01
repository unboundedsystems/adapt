import {
    Compute,
    ComputeProps,
    Container,
    ContainerProps,
    DockerHost,
    k8s,
    NetworkService,
    NetworkServiceProps,
} from "@adpt/cloud";
import Adapt, { rule, Style } from "@adpt/core";

function kubeClusterInfo() {
    // tslint:disable-next-line:no-var-requires
    return { kubeconfig: require("./kubeconfig.json") };
}

export const k8sStyle =
    <Style>
        {Container} {rule<ContainerProps>((props) => (
            <k8s.K8sContainer {...k8s.k8sContainerProps(props)} />
        ))}

        {Compute} {rule<ComputeProps>((props) => (
            <k8s.Pod config={kubeClusterInfo()} terminationGracePeriodSeconds={0}>
                {props.children}
            </k8s.Pod>
        ))}

        {DockerHost} {rule(() => null)}

        {NetworkService} {rule<NetworkServiceProps>((props) => (
            <k8s.Service config={kubeClusterInfo()} {...k8s.k8sServiceProps(props)} />
        ))}

    </Style>;
export default k8sStyle;
