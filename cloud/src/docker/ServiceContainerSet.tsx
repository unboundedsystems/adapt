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
} from "@adpt/core";
import { ContainerProps, isContainerElement, PortBinding } from "../Container";
import {
    isNetworkServiceElement,
    NetworkService,
    NetworkServiceProps,
    ServicePort
} from "../NetworkService";
import { ServiceProps } from "../Service";
import { DockerContainer } from "./DockerContainer";
import { NetworkService as DockerNetworkService } from "./NetworkService";
import { DockerContainerProps } from "./types";

/**
 * Props for {@link docker.ServiceContainerSet}
 *
 * @public
 */
export interface ServiceContainerSetProps extends ServiceProps {
    /**
     * Props to apply to all {@link docker.DockerContainer}s within this
     * ServiceContainerSet. If a prop is specified in the source {@link Container}
     * component and in `containerProps`, `containerProps` will take
     * precedence.
     */
    containerProps?: Partial<DockerContainerProps>;
    /**
     * If set, all children of this ServiceContainerSet that support the
     * `dockerHost` prop will get this value, overriding any other value for
     * this prop.
     */
    dockerHost?: string;
}

function mapContainer(absEl: AdaptElement<ContainerProps>,
    spProps: ServiceContainerSetProps, helpers: BuildHelpers,
    portBindings: PortBinding | undefined) {
    const { containerProps = {} } = spProps;
    const { handle: _h, ...absProps } = absEl.props;
    const finalProps = {
        ...absProps,
        ...containerProps,
        key: absEl.props.key,
    };
    if (spProps.dockerHost) finalProps.dockerHost = spProps.dockerHost;

    // Add the port bindings from the NetworkServices
    if (portBindings) {
        finalProps.portBindings = {
            ...(finalProps.portBindings || {}),
            ...portBindings,
        };
    }

    const ctr = <DockerContainer {...finalProps} />;
    absEl.props.handle.replaceTarget(ctr, helpers);
    return ctr;
}

function mapNetworkService(absEl: AdaptElement<NetworkServiceProps>,
    _props: ServiceContainerSetProps, helpers: BuildHelpers) {
    const { handle: _h, ...props } = absEl.props;
    const svc = <DockerNetworkService {...props} />;
    absEl.props.handle.replaceTarget(svc, helpers);
    return svc;
}

/**
 * Record which NetworkService elements expose a service with external
 * scope and record the port binding associated with the endpoint element.
 * @internal
 */
function getPortBindings(elems: ServiceContainerSetProps["children"]) {
    const portMap = new Map<AdaptElement, PortBinding>();
    const getPorts = (el: AdaptElement) => {
        let ret = portMap.get(el);
        if (!ret) {
            ret = {};
            portMap.set(el, ret);
        }
        return ret;
    };
    const toPortNum = (p: ServicePort) => {
        const pNum = Number(p);
        if (isNaN(pNum) || !Number.isInteger(pNum) || pNum <= 0 || pNum >= 65536) {
            throw new Error(`Network service port ${p} is not a valid number`);
        }
        return pNum;
    };

    for (const el of elems) {
        if (!isNetworkServiceElement(el) || el.props.scope !== "external") {
            continue;
        }
        const endpoint = el.props.endpoint && el.props.endpoint.target;
        if (!endpoint) continue;
        const ports = getPorts(endpoint);
        const proto = el.props.protocol || NetworkService.defaultProps.protocol;
        const ctrPort = el.props.targetPort || el.props.port;
        const hostPort = toPortNum(el.props.port);
        ports[`${ctrPort}/${proto.toLowerCase()}`] = hostPort;
    }

    return portMap;
}

/**
 * A component for mapping a group of abstract {@link Container}s and
 * {@link NetworkService}s to Docker {@link docker.DockerContainer | DockerContainer}s
 * and {@link docker.NetworkService}s.
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
 * `ServiceContainerSet` maps those abstract components into Docker components
 * like this:
 * ```tsx
 * <Group>
 *   <docker.DockerContainer ... >
 *   <docker.DockerContainer ... >
 *   <docker.NetworkService ... >
 * </Group>
 * ```
 * An example style rule to do this is:
 * ```tsx
 * {Service}
 * {Adapt.rule((matchedProps) => {
 *     const { handle, ...remainingProps } = matchedProps;
 *     return <ServiceContainerSet {...remainingProps} />;
 * })}
 * ```
 *
 * Currently, {@link docker.NetworkService} implements the {@link NetworkServiceInstance}
 * interface, but does not deploy a network proxy component. So the Docker
 * ServiceContainerSet component applies the network port configuration specified by
 * the {@link NetworkService}s to their target
 * {@link docker.DockerContainer | DockerContainer}s.
 *
 * @public
 */
export class ServiceContainerSet extends DeferredComponent<ServiceContainerSetProps> {
    build(helpers: BuildHelpers) {
        const children = childrenToArray(this.props.children);

        const portMap = getPortBindings(children);

        const mappedChildren = children.map((c) => {
            if (isContainerElement(c)) {
                return mapContainer(c, this.props, helpers, portMap.get(c));
            }
            if (isNetworkServiceElement(c)) {
                return mapNetworkService(c, this.props, helpers);
            }
            return c;
        });

        return <Group key={this.props.key}>{mappedChildren}</Group>;
    }
}
