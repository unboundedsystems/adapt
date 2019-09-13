/*
 * Copyright 2019 Unbounded Systems, LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import Adapt, {
    AdaptElement,
    BuildHelpers,
    childrenToArray,
    DeferredComponent,
    Group,
    handle,
} from "@adpt/core";
import { ContainerProps as AbsContainerProps, isContainerElement } from "../Container";
import { isNetworkServiceElement, NetworkServiceProps } from "../NetworkService";
import { ServiceProps as AbsServiceProps } from "../Service";
import { ClusterInfo } from "./common";
import { Container, K8sContainerProps } from "./Container";
import { Pod, PodProps } from "./Pod";
import { k8sServiceProps, Service, ServiceProps } from "./Service";

/**
 * Props for {@link k8s.ServiceDeployment}
 *
 * @public
 */
export interface ServiceDeploymentProps extends AbsServiceProps {
    config: ClusterInfo;
    serviceProps?: Partial<ServiceProps>;
    podProps?: Partial<PodProps>;
    containerProps?: Partial<K8sContainerProps>;
}

function mapChild(kid: ServiceDeploymentProps["children"],
    props: ServiceDeploymentProps, helpers: BuildHelpers) {
    if (isContainerElement(kid)) return mapContainer(kid, props, helpers);
    if (isNetworkServiceElement(kid)) return mapNetworkService(kid, props, helpers);
    return kid;
}

function mapContainer(absEl: AdaptElement<AbsContainerProps>,
    props: ServiceDeploymentProps, helpers: BuildHelpers) {
    const { config, containerProps = {}, podProps = {} } = props;
    const { handle: _h, ...absProps } = absEl.props;
    const pod =
        <Pod config={config} key={absEl.props.key} {...podProps} >
            <Container {...absProps} k8sContainerProps={containerProps} />
        </Pod>;
    absEl.props.handle.replaceTarget(pod, helpers);
    return pod;
}

function mapNetworkService(absEl: AdaptElement<NetworkServiceProps>,
    props: ServiceDeploymentProps, helpers: BuildHelpers) {
    const { config, serviceProps = {} } = props;
    const hand = handle();
    const svc =
        <Service
            handle={hand}
            config={config}
            key={absEl.props.key}
            {...k8sServiceProps(absEl.props)}
            {...serviceProps}
        />;
    absEl.props.handle.replaceTarget(svc, helpers);
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
 *
 * @public
 */
export class ServiceDeployment extends DeferredComponent<ServiceDeploymentProps> {
    build(helpers: BuildHelpers) {
        const mappedChildren = childrenToArray(this.props.children).map((c) =>
            mapChild(c, this.props, helpers));
        return <Group>{mappedChildren}</Group>;
    }
}
