import Adapt, { AdaptElement, childrenToArray, DeferredComponent, Group, handle } from "@usys/adapt";
import { ContainerProps, isContainerElement } from "../Container";
import { isNetworkServiceElement, NetworkServiceProps } from "../NetworkService";
import { ServiceProps as AbsServiceProps } from "../Service";
import { Kubeconfig } from "./common";
import { K8sContainer, k8sContainerProps, K8sContainerProps } from "./Container";
import { Pod, PodProps } from "./Pod";
import { k8sServiceProps, Service, ServiceProps } from "./Service";

export interface ServiceDeploymentProps extends AbsServiceProps {
    config: Kubeconfig;
    serviceProps?: Partial<ServiceProps>;
    podProps?: Partial<PodProps>;
    containerProps?: Partial<K8sContainerProps>;
}

function mapChild(kid: ServiceDeploymentProps["children"], props: ServiceDeploymentProps) {
    if (isContainerElement(kid)) return mapContainer(kid, props);
    if (isNetworkServiceElement(kid)) return mapNetworkService(kid, props);
    return kid;
}

function mapContainer(absEl: AdaptElement<ContainerProps>, props: ServiceDeploymentProps) {
    const { config, containerProps = {}, podProps = {} } = props;
    const hand = handle();
    const pod =
        <Pod config={config} handle={hand} {...podProps} >
            <K8sContainer {...k8sContainerProps(absEl.props)} {...containerProps} />
        </Pod>;
    absEl.props.handle.replaceTarget(pod);
    return pod;
}

function mapNetworkService(absEl: AdaptElement<NetworkServiceProps>, props: ServiceDeploymentProps) {
    const { config, serviceProps = {} } = props;
    const hand = handle();
    const svc = <Service handle={hand} config={config} {...k8sServiceProps(absEl.props)} {...serviceProps} />;
    absEl.props.handle.replaceTarget(svc);
    return svc;
}

export class ServiceDeployment extends DeferredComponent<ServiceDeploymentProps> {
    build() {
        const mappedChildren = childrenToArray(this.props.children).map((c) => mapChild(c, this.props));
        return <Group>{mappedChildren}</Group>;
    }
}
