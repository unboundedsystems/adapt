import Adapt, { rule, Style } from "@usys/adapt";
import {
    Compute,
    ComputeProps,
    Container,
    ContainerProps,
    DockerHost,
    k8s,
    NetworkService,
    NetworkServiceProps,
} from "@usys/cloud";

function kubeconfig() {
    // tslint:disable-next-line:no-var-requires
    return require("./kubeconfig.json");
}

export const k8sStyle =
    <Style>
        {Container} {rule<ContainerProps>((props) => (
            <k8s.K8sContainer {...k8s.k8sContainerProps(props)} />
        ))}

        {Compute} {rule<ComputeProps>((props) => (
            <k8s.Pod config={kubeconfig()} terminationGracePeriodSeconds={0}>
                {props.children}
            </k8s.Pod>
        ))}

        {DockerHost} {rule(() => null)}

        {NetworkService} {rule<NetworkServiceProps>((props) => (
            <k8s.Service config={kubeconfig()} {...k8s.k8sServiceProps(props)} />
        ))}

    </Style>;
export default k8sStyle;
