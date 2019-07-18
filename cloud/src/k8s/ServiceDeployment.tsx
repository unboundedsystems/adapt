import Adapt, { AdaptElement, childrenToArray, DeferredComponent, Group, handle } from "@adpt/core";
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

/**
 * A component for mapping a group of abstract {@link Container}s and
 * {@link NetworkService}s to Kubernetes {@link k8s.Pod}s and
 * {@link k8s.K8sContainer}s.
 *
 * @remarks
 * This component is intended to be used to replace {@link Container} and
 * {@link NetworkService} components that are grouped together, as the
 * only children of a common parent in a pattern that looks like this:
 * ```tsx
 * <Service>
 *   <Container ... />
 *   <Container ... />
 *   <NetworkService ... />
 * </Service>
 * ```
 * `ServiceDeployment` would map those abstract components into corresponding
 * k8s components like this:
 * ```tsx
 * <Group>
 *   <k8s.Pod ... >
 *     <k8s.K8sContainer ... />
 *   </k8s.Pod>
 *   <k8s.Pod ... >
 *     <k8s.K8sContainer ... />
 *   </k8s.Pod>
 *   <k8s.Service ... />
 * </Group>
 * ```
 * An example style rule to do this is:
 * ```tsx
 * {Adapt.rule((matchedProps) => {
 *     const { handle, ...remainingProps } = matchedProps;
 *     return <ServiceDeployment config={kubeconfig} {...remainingProps} />;
 * })}
 * ```
 * `ServiceDeployment` also requires the `config` prop which specifies
 * connection and authentication information for the Kubernetes cluster on
 * which these objects should be created.
 */
export class ServiceDeployment extends DeferredComponent<ServiceDeploymentProps> {
    build() {
        const mappedChildren = childrenToArray(this.props.children).map((c) => mapChild(c, this.props));
        return <Group>{mappedChildren}</Group>;
    }
}
