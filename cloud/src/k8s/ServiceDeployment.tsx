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
    ComponentType,
    DeferredComponent,
    Group,
    handle,
    WithChildren,
} from "@adpt/core";
import ld from "lodash";
import { OmitT } from "type-ops";
import { ContainerProps as AbsContainerProps, isContainerElement } from "../Container";
import { DockerImageInstance, RegistryDockerImage } from "../docker";
import { isNetworkServiceElement, NetworkServiceProps } from "../NetworkService";
import { ServiceProps as AbsServiceProps } from "../Service";
import { ClusterInfo } from "./common";
import { Container, K8sContainerProps } from "./Container";
import { Deployment, DeploymentProps } from "./Deployment";
import { Pod, PodProps } from "./Pod";
import { k8sServiceProps, Service, ServiceProps } from "./Service";

interface AllowableComponentProps extends WithChildren {
    config: ClusterInfo;
}

/**
 * Props for {@link k8s.ServiceDeployment}
 *
 * @public
 */
export interface ServiceDeploymentProps<T extends AllowableComponentProps = DeploymentProps> extends AbsServiceProps {
    config: ClusterInfo;
    serviceProps?: Partial<ServiceProps>;
    component: ComponentType<T>;
    componentProps: T;
    podProps?: Partial<PodProps>;
    containerProps?: Partial<OmitT<K8sContainerProps, "image">>;
}

function mapChild<T extends AllowableComponentProps>(kid: ServiceDeploymentProps["children"],
    props: ServiceDeploymentProps<T>, helpers: BuildHelpers) {
    if (isContainerElement(kid)) return mapContainer(kid, props, helpers);
    if (isNetworkServiceElement(kid)) return mapNetworkService(kid, props, helpers);
    return kid;
}

function mapContainer<T extends AllowableComponentProps>(absEl: AdaptElement<AbsContainerProps>,
    props: ServiceDeploymentProps<T>, helpers: BuildHelpers) {
    const {
        config,
        containerProps: rawContainerProps = {},
        podProps = {},
        // tslint:disable-next-line: variable-name
        component: MyComponent,
        componentProps
    } = props;
    //just in case image is there anyway, remove it since Container will use it if present
    const { image: _i, ...containerProps } = rawContainerProps as K8sContainerProps;
    const { handle: _h, ...absProps } = absEl.props;
    let registryImage: AdaptElement | undefined;
    let image = absProps.image;
    if (config.registryUrl !== undefined) {
        //FIXME(manishv) when RegistryDockerImage can push arbitrary string images, remove this
        if (!ld.isString(image)) {
            const regImg = handle<DockerImageInstance>();
            registryImage = <RegistryDockerImage handle={regImg} registryUrl={config.registryUrl} imageSrc={image} />;
            image = regImg;
        } else {
            //FIXME(manishv) when helpers gives a way to warn, warn that string images aren't supported
        }
    }

    const elem = <MyComponent {...{ config, ...componentProps}}>
        <Pod isTemplate key={absEl.props.key} {...podProps}>
            <Container {...absProps} image={image} k8sContainerProps={containerProps} />
        </Pod>
    </MyComponent>;

    absEl.props.handle.replaceTarget(elem, helpers);
    if (registryImage) return [registryImage, elem];
    return elem;
}

function mapNetworkService<T extends AllowableComponentProps>(
    absEl: AdaptElement<NetworkServiceProps>,
    props: ServiceDeploymentProps<T>, helpers: BuildHelpers) {
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
 *
 * ```tsx
 * <Service>
 *   <Container ... />
 *   <Container ... />
 *   <NetworkService ... />
 * </Service>
 * ```
 *
 * `ServiceDeployment` would map those abstract components into corresponding
 * k8s components like this:
 * ```tsx
 * <Group>
 *   <docker.RegistryDockerImage ... /> //If props.config specifies a registry
 *   <k8s.Deployment ... >
 *     <Pod isTemplate>
 *       <k8s.K8sContainer ... />
 *     </Pod>
 *   </k8s.Deployment>
 *   <docker.RegistryDockerImage ... /> //If props.config specifies a registry
 *   <k8s.Deployment ... >
 *     <Pod isTemplate>
 *       <k8s.K8sContainer ... />
 *     </Pod>
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
export class ServiceDeployment<T extends AllowableComponentProps> extends DeferredComponent<ServiceDeploymentProps<T>> {
    static defaultProps = {
        component: Deployment,
        componentProps: { replicas: 1 }
    };

    build(helpers: BuildHelpers) {
        const mappedChildren = ld.flatten(childrenToArray(this.props.children).map((c) =>
            mapChild(c, this.props, helpers)));
        return <Group>{mappedChildren}</Group>;
    }
}
