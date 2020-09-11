/*
 * Copyright 2018-2020 Unbounded Systems, LLC
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
import { PodSecurityContext } from "./Pod";

/** @public */
export interface VolumeMount {
    /**
     * Path within the container at which the volume should be mounted.
     *
     * Must not contain ':'.
     */
    mountPath: string;
    /**
     * mountPropagation determines how mounts are propagated from the host to container and the other way around.
     *
     * When not set, MountPropagationNone is used. This field is beta in 1.10.
     *
     * @defaultValue MountPropagationNone
     */
    mountPropagation?: string;
    /** This must match the Name of a Volume. */
    name: string;
    /**
     * Mounted read-only if true, read-write otherwise (false or unspecified).
     *
     * @defaultValue false
     */
    readOnly?: boolean;
    /**
     * Path within the volume from which the container's volume should be mounted.
     *
     * Defaults to "" (volume's root).
     *
     * @defaultValue ""
     */
    subPath?: string;
    /**
     * Expanded path within the volume from which the container's volume should be mounted.
     *
     * Behaves similarly to SubPath but environment variable references $(VAR_NAME)
     * are expanded using the container's environment.
     *
     * Defaults to "" (volume's root).
     *
     * SubPathExpr and SubPath are mutually exclusive.
     *
     * @defaultValue ""
     */
    subPathExpr?: string;
}

/** @public */
export interface ConfigMapEnvSource {
    /**
     * Name of the referent.
     *
     * More info: {@link https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#names}
     */
    name?: string;
    /**
     * Specify whether the ConfigMap must be defined
     */
    optional?: boolean;
}

/** @public */
export interface SecretEnvSource {
    /**
     * Name of the referent.
     *
     * More info: {@link https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#names}
     */
    name?: string;
    /**
     * Specify whether the Secret must be defined
     */
    optional?: boolean;
}

/** @public */
export interface EnvFromSource {
    /** The ConfigMap to select from */
    configMapRef?: ConfigMapEnvSource;
    /** An optional identifier to prepend to each key in the ConfigMap. Must be a C_IDENTIFIER. */
    prefix?: string;
    /** SecretEnvSource	The Secret to select from */
    secretRef?: SecretEnvSource;
}

/** @public */
export interface ExecAction {
    /**
     * Command is the command line to execute inside the container.
     *
     * The working directory for the command is root ('/') in the container's filesystem.
     * The command is simply exec'd, it is not run inside a shell,
     * so traditional shell instructions ('|', etc) won't work.
     * To use a shell, you need to explicitly call out to that shell.
     *
     * Exit status of 0 is treated as live/healthy and non-zero is unhealthy.
     */
    command: string[];
}

/** @public */
export interface HTTPGetAction {
    /**
     * Host name to connect to, defaults to the pod IP.
     *
     * You probably want to set "Host" in httpHeaders instead.
     */
    host?: string;
    /** Custom headers to set in the request. HTTP allows repeated headers. */
    httpHeaders?: { name: string; value: string; }[];
    /** Path to access on the HTTP server. */
    path: string;
    /**
     * Name or number of the port to access on the container.
     *
     * Number must be in the range 1 to 65535. Name must be an IANA_SVC_NAME.
     */
    port: number | string;
    /**
     * Scheme to use for connecting to the host.
     *
     * @defaultValue HTTP.
     */
    scheme?: string;
}

/** @public */
export interface TCPSocketAction {
    /** Host name to connect to, defaults to the pod IP. */
    host?: string;
    /**
     * Number or name of the port to access on the container.
     *
     * Number must be in the range 1 to 65535.
     * Name must be an IANA_SVC_NAME.
     */
    port: string | number;
}

/** @public */
export interface Probe {
    /**
     * Exec specifies the action to take.
     *
     * Only one of exec, httpGet, or tcpSocket should be specified
     */
    exec?: ExecAction;
    /**
     * Minimum consecutive failures for the probe to be considered failed after having succeeded.
     *
     * Defaults to 3. Minimum value is 1.
     *
     * @defaultValue 3
     */
    failureThreshold?: number;
    /** Specifies the http request to perform. */
    httpGet?: HTTPGetAction;
    /**
     *  Seconds after the container has started before liveness probes are initiated.
     *  More info: {@link https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle#container-probes}
     */
    initialDelaySeconds?: number;
    /** How often (in seconds) to perform the probe. Default to 10 seconds. Minimum value is 1. */
    periodSeconds?: number;
    /**
     * Minimum consecutive successes for the probe to be considered successful after having failed.
     *
     * Must be 1 for liveness and startup. Minimum value is 1.
     *
     * @defaultValue 1
     */
    successThreshold?: number;
    /**
     * Specifies an action involving a TCP port.
     *
     * TCP hooks not yet supported
     */
    tcpSocket?: TCPSocketAction;
    /**
     * Number of seconds after which the probe times out.
     *
     * Defaults to 1 second. Minimum value is 1.
     *
     * More info: {@link https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle#container-probes}
     *
     * @defaultValue 1
     */
    timeoutSeconds?: number;
}

/** @public */
export interface ResourceRequirements {
    /**
     * Limits describes the maximum amount of compute resources allowed.
     *
     * More info: {@link https://kubernetes.io/docs/concepts/configuration/manage-compute-resources-container/}
     */
    limits?: { [key: string]: any };
    /**
     * Describes the minimum amount of compute resources required.
     *
     * If Requests is omitted for a container, it defaults to Limits if that is explicitly specified,
     * otherwise to an implementation-defined value.
     *
     * More info: {@link https://kubernetes.io/docs/concepts/configuration/manage-compute-resources-container/}
     */

    requests?: { [key: string]: any };
}

/** @public */
export type Handler =
      { exec: ExecAction; }
    | { httpGet: HTTPGetAction; }
    | { tcpSocket: TCPSocketAction; };

/** @public */
export interface Lifecycle {
    /**
     * PostStart is called immediately after a container is created.
     *
     * If the handler fails, the container is terminated and restarted according to its restart policy.
     * Other management of the container blocks until the hook completes.
     *
     * More info: {@link https://kubernetes.io/docs/concepts/containers/container-lifecycle-hooks/#container-hooks}
     */
    postStart: Handler;
    //tslint:disable max-line-length
    /**
     * Called immediately before a container is terminated due to an API request or management event such as liveness/startup probe failure, preemption, resource contention, etc.
     *
     * The handler is not called if the container crashes or exits.
     * The reason for termination is passed to the handler.
     * The Pod's termination grace period countdown begins before the PreStop hooked is executed.
     * Regardless of the outcome of the handler, the container will eventually terminate within the Pod's termination grace period.
     * Other management of the container blocks until the hook completes or until the termination grace period is reached.
     *
     * More info: {@link https://kubernetes.io/docs/concepts/containers/container-lifecycle-hooks/#container-hooks}
     */
    //tslint:enable max-line-length
    preStop: Handler;
}

/** @public */
export interface VolumeDevice {
    /** The path inside of the container that the device will be mapped to. */
    devicePath: string;
    /** name must match the name of a persistentVolumeClaim in the pod */
    name: string;
}

/**
 * Resource spec for a Kubernetes container.
 * See the Kubernetes
 * {@link https://kubernetes.io/docs/reference/generated/kubernetes-api/v1.18/#container-v1-core | API docs }
 * for more details.
 * @public
 */
export interface ContainerSpec {
    //tslint:disable max-line-length
    /**
     * Arguments to the entrypoint.
     *
     * The docker image's CMD is used if this is not provided.
     * Variable references $(VAR_NAME) are expanded using the container's environment.
     * If a variable cannot be resolved, the reference in the input string will be unchanged.
     * The $(VAR_NAME) syntax can be escaped with a double $$, ie: $$(VAR_NAME).
     * Escaped references will never be expanded, regardless of whether the variable exists or not.
     * Cannot be updated.
     * More info: {@link https://kubernetes.io/docs/tasks/inject-data-application/define-command-argument-container/#running-a-command-in-a-shell}
     */
    //tslint:enable max-line-length
    args?: string[];
    //tslint:disable max-line-length
    /**
     * Entrypoint array.
     *
     * Not executed within a shell.
     * The docker image's ENTRYPOINT is used if this is not provided.
     * Variable references $(VAR_NAME) are expanded using the container's environment.
     * If a variable cannot be resolved, the reference in the input string will be unchanged.
     * The $(VAR_NAME) syntax can be escaped with a double $$, ie: $$(VAR_NAME).
     * Escaped references will never be expanded, regardless of whether the variable exists or not.
     * Cannot be updated.
     * More info: {@link https://kubernetes.io/docs/tasks/inject-data-application/define-command-argument-container/#running-a-command-in-a-shell}
     */
    //tslint:enable max-line-length
    command?: string[];
    /**
     * List of environment variables to set in the container. Cannot be updated.
     */
    env?: EnvVar[];
    /**
     * List of sources to populate environment variables in the container.
     *
     * The keys defined within a source must be a C_IDENTIFIER.
     * All invalid keys will be reported as an event when the container is starting.
     * When a key exists in multiple sources, the value associated with the last source will take precedence.
     * Values defined by an Env with a duplicate key will take precedence. Cannot be updated.
     */
    envFrom?: EnvFromSource[];
    /**
     * Docker image name.
     *
     * More info: {@link https://kubernetes.io/docs/concepts/containers/images}
     *
     * This field is optional to allow higher level config management to default or override container
     * images in workload controllers like Deployments and StatefulSets.
     */
    image?: string;
    /**
     * Image pull policy.
     *
     * One of Always, Never, IfNotPresent.
     * Defaults to Always if :latest tag is specified,
     * or IfNotPresent otherwise.
     * Cannot be updated.
     *
     * More info: {@link https://kubernetes.io/docs/concepts/containers/images#updating-images}
     */
    imagePullPolicy?: "Always" | "Never" | "IfNotPresent";

    /**
     * List of sources to populate environment variables in the container.
     *
     * The keys defined within a source must be a C_IDENTIFIER.
     * All invalid keys will be reported as an event when the container is starting.
     * When a key exists in multiple sources, the value associated with the last source will take precedence.
     * Values defined by an Env with a duplicate key will take precedence. Cannot be updated.
     */
    lifecycle?: Lifecycle;
    /**
     * Periodic probe of container liveness.
     *
     * Container will be restarted if the probe fails.
     * Cannot be updated.
     * More info: {@link https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle#container-probes}
     */
    livenessProbe?: Probe;
    /**
     * Name of the container specified as a DNS_LABEL.
     *
     * Each container in a pod must have a unique name (DNS_LABEL). Cannot be updated.
     */
    name: string; //Must be unique within pod
    /**
     * List of ports to expose from the container.
     *
     * Exposing a port here gives the system additional information about the network connections a container uses,
     * but is primarily informational.
     * Not specifying a port here DOES NOT prevent that port from being exposed.
     * Any port which is listening on the default "0.0.0.0" address inside a container will be accessible from
     * the network.
     * Cannot be updated.
     */
    ports?: ContainerPort[];
    /**
     * Periodic probe of container service readiness.
     *
     * Container will be removed from service endpoints if the probe fails.
     * Cannot be updated.
     *
     * More info: {@link https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle#container-probes}
     */
    readinessProbe?: Probe;
    /**
     * Compute Resources required by this container.
     *
     * Cannot be updated.
     *
     * More info: {@link https://kubernetes.io/docs/concepts/configuration/manage-compute-resources-container/}
     */
    resources?: ResourceRequirements;
    /**
     * Security options the pod should run with.
     *
     * More info: {@link https://kubernetes.io/docs/concepts/policy/security-context/}
     * More info: {@link https://kubernetes.io/docs/tasks/configure-pod-container/security-context/}
     */
    securityContext?: PodSecurityContext;
    /**
     * Indicates that the Pod has successfully initialized.
     *
     * If specified, no other probes are executed until this completes successfully.
     * If this probe fails, the Pod will be restarted, just as if the livenessProbe failed.
     * This can be used to provide different probe parameters at the beginning of a Pod's lifecycle,
     * when it might take a long time to load data or warm a cache, than during steady-state operation.
     *
     * This cannot be updated.
     * This is a beta feature enabled by the StartupProbe feature flag.
     * More info: {@link https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle#container-probes}
     */
    startupProbe?: Probe;
    /**
     * Whether this container should allocate a buffer for stdin in the container runtime.
     *
     * If this is not set, reads from stdin in the container will always result in EOF. Default is false.
     */
    stdin?: boolean;
    /**
     * Whether the container runtime should close the stdin channel after it has been opened by a single attach.
     *
     * When stdin is true the stdin stream will remain open across multiple attach sessions.
     * If stdinOnce is set to true, stdin is opened on container start,
     * is empty until the first client attaches to stdin,
     * and then remains open and accepts data until the client disconnects,
     * at which time stdin is closed and remains closed until the container is restarted.
     * If this flag is false, a container processes that reads from stdin will never receive an EOF. Default is false
     */
    stdinOnce?: boolean;
    // tslint:disable max-line-length
    /**
     * Path at which the file to which the container's termination message will be written is mounted into the container's filesystem.
     *
     * Message written is intended to be brief final status, such as an assertion failure message.
     * Will be truncated by the node if greater than 4096 bytes.
     * The total message length across all containers will be limited to 12kb.
     * Defaults to /dev/termination-log. Cannot be updated.
     */
    // tslint:enable max-line-length
    terminationMessagePath?: string;
    /**
     * Indicate how the termination message should be populated.
     *
     * File will use the contents of terminationMessagePath to populate the container status
     * message on both success and failure. FallbackToLogsOnError will use the last chunk of
     * container log output if the termination message file is empty and the container exited
     * with an error.
     * The log output is limited to 2048 bytes or 80 lines, whichever is smaller.
     * Defaults to File.
     * Cannot be updated.
     *
     * @defaultValue File
     */
    terminationMessagePolicy?: "File" | "FallbackToLogsOnError";

    /**
     * Whether this container should allocate a TTY for itself, also requires 'stdin' to be true.
     *
     * @defaultValue false
     */
    tty?: boolean;

    /**
     * volumeDevices is the list of block devices to be used by the container.
     */
    volumeDevices?: VolumeDevice[];
    /** volumeDevices is the list of block devices to be used by the container. */
    volumeMounts?: VolumeMount[];
    /**
     * Container's working directory.
     *
     * If not specified, the container runtime's default will be used,
     * which might be configured in the container image.
     * Cannot be updated.
     */
    workingDir?: string;
}

/**
 * Props for the Kubernetes-specific {@link k8s.K8sContainer} component.
 * @public
 */
export interface K8sContainerProps extends ContainerSpec { }

/** @public */
export interface ContainerPort {
    /**
     * Number of port to expose on the pod's IP address.
     * @remarks
     * This must be a valid integer port number, `0 < x < 65536`.
     */
    containerPort: number;
    /** What host IP to bind the external port to. */
    hostIP?: string;
    /**
     * Number of port to expose on the host.
     * @remarks
     * If specified, this must be a valid integer port number,
     * `0 < x < 65536`. If HostNetwork is specified,
     * this must match ContainerPort. Most containers do not need this.
     */
    hostPort?: number;
    /**
     * A unique-within-pod name for the container
     * @remarks
     * If specified, this must be an IANA_SVC_NAME and unique within the pod.
     * Each named port in a pod must have a unique name. Name for the port
     * that can be referred to by services.
     */
    name?: string;
    /** Protocol for port. Must be UDP or TCP. Defaults to "TCP". */
    protocol?: string;
}

/** @public */
export type EnvVar = EnvVarSimple | EnvVarFrom;

/** @public */
export interface EnvVarSimple {
    /** Name of the environment variable. Must be a C_IDENTIFIER. */
    name: string;
    /**
     * Variable references $(VAR_NAME) are expanded using the previous defined
     * environment variables in the container and any service environment
     * variables. If a variable cannot be resolved, the reference in the input
     * string will be unchanged. The $(VAR_NAME) syntax can be escaped with a
     * double $$, ie: $$(VAR_NAME). Escaped references will never be expanded,
     * regardless of whether the variable exists or not. Defaults to "".
     */
    value: string;
}

/** @public */
export interface EnvVarFrom {
    /** Source for the environment variable's value. Cannot be used if value is not empty. */
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

/**
 * Tests whether an element is a {@link k8s.K8sContainer} element
 * @param x - element to test
 * @returns `true` if element is a {@link k8s.K8sContainer}, `false` otherwise
 *
 * @remarks
 * Acts as a TypeScript type assertion that will assert that `x` is `AdaptElement<K8sContainerProps>`
 *
 * @public
 */
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
// TODO: The "as any" is a workaround for an api-extractor bug. See issue #185.
(Container as any).displayName = "k8s.Container";
(Container as any).defaultProps = AbsContainer.defaultProps;
