/*
 * Copyright 2018-2019 Unbounded Systems, LLC
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
    BuiltinProps,
    GoalStatus,
    PrimitiveComponent,
    SFCBuildProps,
    SFCDeclProps,
    useDeployedWhen,
    waiting,
} from "@adpt/core";
import { mapMap } from "@adpt/utils";
import { ReplaceT } from "type-ops";
import {
    Container as AbsContainer,
    ContainerProps as AbsContainerProps,
    useLatestImageFrom,
} from "../Container";
import {
    mergeEnvPairs
} from "../env";

/**
 * Resource spec for a Kubernetes container.
 * See the Kubernetes
 * {@link https://kubernetes.io/docs/reference/generated/kubernetes-api/v1.10/#container-v1-core | API docs }
 * for more details.
 * @public
 */
export interface ContainerSpec {
    name: string; //Must be unique within pod
    image: string;

    args?: string[];
    command?: string[];
    env?: EnvVar[];
    imagePullPolicy?: "Always" | "Never" | "IfNotPresent";
    tty?: boolean;
    ports?: ContainerPort[];
    workingDir?: string;
}

/**
 * Props for the Kubernetes-specific {@link k8s.K8sContainer} component.
 * @public
 */
export interface K8sContainerProps extends ContainerSpec { }

export interface ContainerPort {
    // Number of port to expose on the pod's IP address. This must be a
    // valid integer port number, 0 < x < 65536.
    containerPort: number;
    // What host IP to bind the external port to.
    hostIP?: string;
    // Number of port to expose on the host. If specified, this must be a
    // valid integer port number, 0 < x < 65536. If HostNetwork is specified,
    // this must match ContainerPort. Most containers do not need this.
    hostPort?: number;
    // If specified, this must be an IANA_SVC_NAME and unique within the pod.
    // Each named port in a pod must have a unique name. Name for the port
    // that can be referred to by services.
    name?: string;
    // Protocol for port. Must be UDP or TCP. Defaults to "TCP".
    protocol?: string;
}

export type EnvVar = EnvVarSimple | EnvVarFrom;

export interface EnvVarSimple {
    // Name of the environment variable. Must be a C_IDENTIFIER.
    name: string;
    // Variable references $(VAR_NAME) are expanded using the previous defined
    // environment variables in the container and any service environment
    // variables. If a variable cannot be resolved, the reference in the input
    // string will be unchanged. The $(VAR_NAME) syntax can be escaped with a
    // double $$, ie: $$(VAR_NAME). Escaped references will never be expanded,
    // regardless of whether the variable exists or not. Defaults to "".
    value: string;
    // Source for the environment variable's value. Cannot be used if value is
    // not empty.
}

export interface EnvVarFrom {
    valueFrom?: any; //EnvVarSource; // NOTE(mansihv): EnvVarSource needs implementation
}

const toK8sEnv = mergeEnvPairs;

const defaultProtocol = "tcp";

class PortInfo {
    portMap = new Map<string, ContainerPort>();

    get containerPorts(): ContainerPort[] | undefined {
        if (this.portMap.size === 0) return undefined;
        return mapMap(this.portMap, (_, p) => p);
    }

    addPortMapping(ctrPort: number | string, hostPort?: number) {
        ctrPort = Number(ctrPort);
        if (isNaN(ctrPort)) {
            throw new Error(`Non-numeric port description not implemented`);
        }
        const e = this.entry(ctrPort);
        if (hostPort !== undefined) e.hostPort = hostPort;
    }

    entry(containerPort: number) {
        const key = this.makeKey(containerPort);
        let e = this.portMap.get(key);
        if (e === undefined) {
            e = { containerPort };
            this.portMap.set(key, e);
        }
        return e;
    }

    makeKey(ctrPort: number, protocol = defaultProtocol): string {
        return `${protocol}/${ctrPort}`;
    }
}

function toK8sPorts(abstractProps: AbsContainerProps): ContainerPort[] | undefined {
    const { ports, portBindings } = abstractProps;
    const pInfo = new PortInfo();

    if (ports != null) ports.forEach((p) => pInfo.addPortMapping(p));

    if (portBindings != null) {
        Object.keys(portBindings).forEach((ctrPort) =>
            pInfo.addPortMapping(ctrPort, portBindings[ctrPort]));
    }
    return pInfo.containerPorts;
}

/**
 * See {@link k8s.k8sContainerProps}.
 * @public
 */
export type FromContainerProps = ReplaceT<AbsContainerProps, { image: string }> & BuiltinProps;

/**
 * Low level utility function to translate from the abstract {@link Container}
 * component props ({@link ContainerProps}) to {@link k8s.K8sContainerProps}
 * to be used in a {@link k8s.K8sContainer}.
 * @remarks
 * Note: The `image` property in the passed in {@link ContainerProps} must
 * be a `string`, not a `Handle`.
 * In most cases, it is preferable to use the {@link k8s.Container} component
 * instead, which is designed specifically to deal with this issue.
 *
 * @param abstractProps - The abstract {@link ContainerProps} to translate from.
 * @param k8sProps - Props that are specific to the {@link k8s.K8sContainer}
 *     component that should be merged into the resulting returned
 *     {@link k8s.K8sContainerProps} object.
 * @public
 */
export function k8sContainerProps(abstractProps: FromContainerProps,
    k8sProps?: Partial<K8sContainerProps>): K8sContainerProps {
    const { command, entrypoint, environment, tty, workingDir } = abstractProps;

    const ret: K8sContainerProps & Partial<BuiltinProps> = {
        key: abstractProps.key,
        name: abstractProps.name,
        image: abstractProps.image,
        ...(k8sProps || {}),
    };

    if (entrypoint != null) {
        ret.args = Array.isArray(entrypoint) ? entrypoint : [entrypoint];
    }
    if (command != null) {
        ret.command = Array.isArray(command) ? command : [command];
    }
    ret.env = toK8sEnv(environment);
    ret.ports = toK8sPorts(abstractProps);
    if (tty != null) ret.tty = tty;
    if (workingDir != null) ret.workingDir = workingDir;

    return ret;
}

export function isK8sContainerElement(x: AdaptElement): x is AdaptElement<K8sContainerProps> {
    return x.componentType === K8sContainer;
}

/**
 * Kubernetes-specific container.
 * @public
 */
export class K8sContainer extends PrimitiveComponent<K8sContainerProps> {
    static defaultProps = {
        imagePullPolicy: "IfNotPresent"
    };

    validate() {
        if (this.props.image == null || this.props.image === "") {
            throw new Error("K8sContainer: image is a required value");
        }
        return undefined;
        //FIXME(manishv) check if name is legal in k8s
        //FIXME(manishv) check if image string is valid URL
        //FIXME(manishv) check if workDir is valid path
    }
}

/**
 * Props for {@link k8s.Container}.
 * @public
 */
export interface ContainerProps extends SFCDeclProps<AbsContainerProps> {
    /**
     * Additional {@link k8s.K8sContainerProps}-specific props that should be
     * added to the instantiated {@link k8s.K8sContainer}.
     */
    k8sContainerProps?: Partial<K8sContainerProps>;
}

/**
 * Component that implements the abstract {@link Container} interface and
 * translates to a Kubernetes-specific {@link k8s.K8sContainer}.
 * @public
 */
export function Container(props: ContainerProps) {
    const {
        image: imgOrHandle,
        k8sContainerProps: addlProps,
        ...rest
    } = props as SFCBuildProps<ContainerProps>;
    const image = useLatestImageFrom(imgOrHandle);

    useDeployedWhen((gs) => {
        if (gs === GoalStatus.Destroyed || image) return true;
        return waiting("Waiting for Docker image");
    });

    if (!image) return null;
    const kProps = k8sContainerProps({ ...rest, image }, addlProps);
    return <K8sContainer {...kProps} />;
}
(Container as any).displayName = "k8s.Container";
(Container as any).defaultProps = AbsContainer.defaultProps;
