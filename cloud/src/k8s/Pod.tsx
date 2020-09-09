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
    BuildData,
    BuildHelpers,
    BuildNotImplemented,
    BuiltinProps,
    childrenToArray,
    DeferredComponent,
    gql,
    Handle,
    isElement,
    isHandle,
    isMountedElement,
    ObserveForStatus,
    waiting,
    WithChildren
} from "@adpt/core";
import { InternalError, Omit, removeUndef } from "@adpt/utils";
import ld from "lodash";
import { ClusterInfo, computeNamespaceFromMetadata, LabelSelector, LocalObjectReference, Metadata, ResourceProps } from "./common";
import { ContainerSpec, isK8sContainerElement, K8sContainer, K8sContainerProps } from "./Container";
import { K8sObserver } from "./k8s_observer";
import { registerResourceKind, resourceElementToName, resourceIdToName } from "./manifest_support";
import { isResource, Resource } from "./Resource";

/** @public */
export interface NodeSelectorRequirement {
    /** The label key that the selector applies to. */
    key: string;
    /**
     * Represents a key's relationship to a set of values.
     *
     * Valid operators are In, NotIn, Exists, DoesNotExist. Gt, and Lt.
     */
    operator: "In" | "NotIn" | "Exists" | "DoesNotExist" | "Gt" | "Lt";
    /**
     * Values for operator
     *
     * If the operator is In or NotIn, the values array must be non-empty.
     * If the operator is Exists or DoesNotExist, the values array must be empty.
     * If the operator is Gt or Lt, the values array must have a single element,
     * which will be interpreted as an integer.
     * This array is replaced during a strategic merge patch.
     */
    values: string[];

}

/** @public */
export interface NodeSelectorTerm {
    /** A list of node selector requirements by node's labels. */
    matchExpressions?: NodeSelectorRequirement[];
    /** A list of node selector requirements by node's fields. */
    matchFields?: NodeSelectorRequirement [];
}

/** @public */
export interface PreferredSchedulingTerm {
    /**
     * A node selector term, associated with the corresponding weight.
     */
    preference: NodeSelectorTerm;
    /** Weight associated with matching the corresponding nodeSelectorTerm, in the range 1-100. */
    weight: number;
}

/** @public */
export interface NodeSelector {
    /** A list of node selector terms. The terms are ORed */
    nodeSelectorTerms: NodeSelectorTerm[];
}

/** @public */
export interface NodeAffinity {
    // tslint:disable-next-line: max-line-length
    /** The scheduler will prefer to schedule pods to nodes that satisfy the affinity expressions specified by this field, but it may choose a node that violates one or more of the expressions. The node that is most preferred is the one with the greatest sum of weights, i.e. for each node that meets all of the scheduling requirements (resource request, requiredDuringScheduling affinity expressions, etc.), compute a sum by iterating through the elements of this field and adding "weight" to the sum if the node matches the corresponding matchExpressions; the node(s) with the highest sum are the most preferred. */
    preferredDuringSchedulingIgnoredDuringExecution?: PreferredSchedulingTerm[];
    // tslint:disable-next-line: max-line-length
    /** If the affinity requirements specified by this field are not met at scheduling time, the pod will not be scheduled onto the node. If the affinity requirements specified by this field cease to be met at some point during pod execution (e.g. due to an update), the system may or may not try to eventually evict the pod from its node. */
    requiredDuringSchedulingIgnoredDuringExecution?: NodeSelector;
}

/** @public */
export interface PodAffinityTerm {
    /**
     * Label query over a set of resources, in this case pods.
     */
    labelSelector: LabelSelector;
    // tslint:disable-next-line: max-line-length
    /** Specifies which namespaces the labelSelector applies to (matches against); null or empty list means "this pod's namespace" */
    namespaces?: string[];
    // tslint:disable-next-line: max-line-length
    /** This pod should be co-located (affinity) or not co-located (anti-affinity) with the pods matching the labelSelector in the specified namespaces, where co-located is defined as running on a node whose value of the label with key topologyKey matches that of any node on which any of the selected pods is running. Empty topologyKey is not allowed. */
    topologyKey: string;
}

/** @public */
export interface WeightedPodAffinityTerm {
    /** A pod affinity term, associated with the corresponding weight. */
    podAffinityTerm: PodAffinityTerm;
    /**
     * weight associated with matching the corresponding podAffinityTerm, in the range 1-100.
     */
    weight: number;
}

/** @public */
export interface PodAffinity {
    // tslint:disable max-line-length
    /**
     * The scheduler will prefer to schedule pods to nodes that satisfy the affinity expressions specified by this field, but it may choose a node that violates one or more of the expressions.
     *
     * The node that is most preferred is the one with the greatest sum of weights,
     * i.e. for each node that meets all of the scheduling requirements (resource request,
     * requiredDuringScheduling affinity expressions, etc.), compute a sum by iterating
     * through the elements of this field and adding "weight" to the sum if the node has pods
     * which matches the corresponding podAffinityTerm; the node(s) with the highest sum are the most preferred.
     */
    // tslint:enable max-line-length
    preferredDuringSchedulingIgnoredDuringExecution: WeightedPodAffinityTerm[];
    // tslint:disable max-line-length
    /**
     * If the affinity requirements specified by this field are not met at scheduling time, the pod will not be scheduled onto the node.
     *
     * If the affinity requirements specified by this field cease to be met at some point during pod execution (e.g. due to a pod label update), the system may or may not try to eventually evict the pod from its node. When there are multiple elements, the lists of nodes corresponding to each podAffinityTerm are intersected, i.e. all terms must be satisfied.
     */
    // tslint:enable max-line-length
    requiredDuringSchedulingIgnoredDuringExecution: PodAffinityTerm[];
}

/** @public */
export interface PodAntiAffinity {
    // tslint:disable-next-line: max-line-length
    /** The scheduler will prefer to schedule pods to nodes that satisfy the anti-affinity expressions specified by this field, but it may choose a node that violates one or more of the expressions. The node that is most preferred is the one with the greatest sum of weights, i.e. for each node that meets all of the scheduling requirements (resource request, requiredDuringScheduling anti-affinity expressions, etc.), compute a sum by iterating through the elements of this field and adding "weight" to the sum if the node has pods which matches the corresponding podAffinityTerm; the node(s) with the highest sum are the most preferred. */
    preferredDuringSchedulingIgnoredDuringExecution: WeightedPodAffinityTerm[];
    // tslint:disable-next-line: max-line-length
    /** If the anti-affinity requirements specified by this field are not met at scheduling time, the pod will not be scheduled onto the node. If the anti-affinity requirements specified by this field cease to be met at some point during pod execution (e.g. due to a pod label update), the system may or may not try to eventually evict the pod from its node. When there are multiple elements, the lists of nodes corresponding to each podAffinityTerm are intersected, i.e. all terms must be satisfied. */
    requiredDuringSchedulingIgnoredDuringExecution: PodAffinity;
}

/** @public */
export interface Affinity {
    /** Describes node affinity scheduling rules for the pod. */
    nodeAffinity: NodeAffinity;
    // tslint:disable-next-line: max-line-length
    /** Describes pod affinity scheduling rules (e.g. co-locate this pod in the same node, zone, etc. as some other pod(s)). */
    podAffinity: PodAffinity;
    // tslint:disable-next-line: max-line-length
    /** PodAntiAffinity	Describes pod anti-affinity scheduling rules (e.g. avoid putting this pod in the same node, zone, etc. as some other pod(s)). */
    podAntiAffinity: PodAntiAffinity;
}

/** @public */
export interface PodDNSConfigOption {
    name: string;
    value?: string;
}

/** @public */
export interface PodDNSConfig {
    /**
     * A list of DNS name server IP addresses.
     *
     * This will be appended to the base nameservers generated from DNSPolicy. Duplicated nameservers will be removed.
     */
    nameservers: string[];
    /**
     * A list of DNS resolver options.
     *
     * This will be merged with the base options generated from DNSPolicy.
     * Duplicated entries will be removed.
     * Resolution options given in Options will override those that appear in the base DNSPolicy.
     */
    options: PodDNSConfigOption[];
    /**
     * A list of DNS search domains for host-name lookup.
     *
     * This will be appended to the base search paths generated from DNSPolicy. Duplicated search paths will be removed.
     */
    searches: string[];
}

/** @public */
interface HostAlias {
    /**
     * Hostnames for the above IP address.
     */
    hostnames: string[];
    /**
     * IP address of the host file entry.
     */
    ip: string;
}

/** @public */
export interface PodReadinessGate {
    /** Refers to a condition in the pod's condition list with matching type. */
    conditionType: string;
}

/** @public */
export interface SELinuxOptions {
    /** SELinux level label that applies to the container. */
    level: string;
    /** SELinux role label that applies to the container. */
    role: string;
    /** SELinux type label that applies to the container. */
    type: string;
    /** SELinux user label that applies to the container */
    user: string;
}

/** @public */
export interface SeccompProfile {
    /**
     * Indicates a profile defined in a file on the node should be used.
     *
     * The profile must be preconfigured on the node to work.
     * Must be a descending path, relative to the kubelet's configured seccomp profile location.
     * Must only be set if type is "Localhost".
     */
    localhostProfile?: string;

    /**
     * Indicates which kind of seccomp profile will be applied.
     *
     * Valid options are:
     * * Localhost - a profile defined in a file on the node should be used.
     * * RuntimeDefault - the container runtime default profile should be used.
     * * Unconfined - no profile should be applied.
     */
    type: "Localhost" | "RuntimeDefault" | "Unconfined";
}

/** @public */
export interface Sysctl {
    name: string;
    value: string;
}

/** @public */
export interface WindowsSecurityContextOptions {
    // tslint:disable max-line-length
    /**
     * The GMSA admission webhook ({@link https://github.com/kubernetes-sigs/windows-gmsa}) inlines the contents of the GMSA credential spec named by the GMSACredentialSpecName field.
     */
    // tslint:enable max-line-length
     gmsaCredentialSpec?: string;
    /**
     * GMSACredentialSpecName is the name of the GMSA credential spec to use.
     */
     gmsaCredentialSpecName?: string;

    /**
     * The UserName in Windows to run the entrypoint of the container process.
     *
     * Defaults to the user specified in image metadata if unspecified. May also be set in PodSecurityContext.
     * If set in both SecurityContext and PodSecurityContext, the value specified in SecurityContext takes precedence.
     */
     runAsUserName?: string;
}

/** @public */
export interface PodSecurityContext {
    /**
     * A special supplemental group that applies to all containers in a pod.
     *
     * Some volume types allow the Kubelet to change the ownership of that volume to be owned by the pod:
     *
     * 1. The owning GID will be the FSGroup
     * 2. The setgid bit is set (new files created in the volume will be owned by FSGroup)
     * 3. The permission bits are OR'd with rw-rw----
     *
     * If unset, the Kubelet will not modify the ownership and permissions of any volume.
     */
    fsGroup?: number;
    /**
     * Defines behavior of changing ownership and permission of the volume before being exposed inside Pod.
     *
     * This field will only apply to volume types which support fsGroup based ownership(and permissions).
     * It will have no effect on ephemeral volume types such as: secret, configmaps and emptydir.
     * Valid values are "OnRootMismatch" and "Always". If not specified defaults to "Always".
     *
     * @defaultValue Always
     */
    fsGroupChangePolicy?: "OnRootMismatch" | "Always";

    /**
     * The GID to run the entrypoint of the container process.
     *
     * Uses runtime default if unset. May also be set in SecurityContext.
     * If set in both SecurityContext and PodSecurityContext, the value specified in
     * SecurityContext takes precedence for that container.
     */
    runAsGroup?: number;

    /**
     * Indicates that the container must run as a non-root user.
     *
     * If true, the Kubelet will validate the image at runtime to ensure that it does not run as UID 0 (root) and
     * fail to start the container if it does. If unset or false, no such validation will be performed.
     * May also be set in SecurityContext.
     * If set in both SecurityContext and PodSecurityContext, the value specified in SecurityContext takes precedence.
     */
    runAsNonRoot?: boolean;
    /**
     * The UID to run the entrypoint of the container process.
     *
     * Defaults to user specified in image metadata if unspecified.
     * May also be set in SecurityContext.
     * If set in both SecurityContext and PodSecurityContext, the value specified in
     * SecurityContext takes precedence for that container.
     */
    runAsUser?: number;

    /**
     * The SELinux context to be applied to all containers.
     *
     * If unspecified, the container runtime will allocate a random SELinux context for each container.
     * May also be set in SecurityContext.
     * If set in both SecurityContext and PodSecurityContext, the value specified in
     * SecurityContext takes precedence for that container.
     */
    seLinuxOptions?: SELinuxOptions;

    /**
     * The seccomp options to use by the containers in this pod.
     */
    seccompProfile?: SeccompProfile;
    /**
     * 	A list of groups applied to the first process run in each container, in addition to the container's primary GID.
     *
     *  If unspecified, no groups will be added to any container.
     */
    supplementalGroups?: number[];

    /**
     * Sysctls hold a list of namespaced sysctls used for the pod.
     *
     * Pods with unsupported sysctls (by the container runtime) might fail to launch.
     */
    sysctls?: Sysctl[];

    /**
     * The Windows specific settings applied to all containers.
     *
     * If unspecified, the options within a container's SecurityContext will be used.
     * If set in both SecurityContext and PodSecurityContext, the value specified in SecurityContext takes precedence.
     */
    windowsOptions: WindowsSecurityContextOptions;
}

/** @public */
export interface Toleration {
    /**
     * Indicates the taint effect to match.
     *
     * Empty means match all taint effects.
     * When specified, allowed values are NoSchedule, PreferNoSchedule and NoExecute.
     */
    effect?: "NoSchedule" | "PreferNoSchedule" | "NoExecute";
    /**
     * The taint key that the toleration applies to.
     *
     * Empty means match all taint keys.
     * If the key is empty, operator must be Exists;
     * this combination means to match all values and all keys.
     */
    key?: string;
    /**
     * Represents a key's relationship to the value.
     *
     * Valid operators are Exists and Equal.
     * Defaults to Equal.
     * Exists is equivalent to wildcard for value, so that a pod can tolerate all taints of a particular category.
     *
     * @defaultValue Equal
     */
    operator?: "Exists" | "Equal";
    // tslint:disable max-line-length
    /**
     * Represents the period of time the toleration (which must be of effect NoExecute, otherwise this field is ignored) tolerates the taint.
     *
     * By default, it is not set, which means tolerate the taint forever (do not evict).
     * Zero and negative values will be treated as 0 (evict immediately) by the system.
     */
    // tslint:enable max-line-length
    tolerationSeconds?: number;
    /**
     * Value is the taint value the toleration matches to.
     *
     * If the operator is Exists, the value should be empty, otherwise just a regular string.
     */
    value?: string;
}

/** @public */
export interface TopologySpreadConstraint {
    /**
     * Used to find matching pods.
     *
     * Pods that match this label selector are counted to determine the
     * number of pods in their corresponding topology domain.
     */
    labelSelector: LabelSelector;
    /**
     * Describes the degree to which pods may be unevenly distributed.
     *
     * When `whenUnsatisfiable=DoNotSchedule`, it is the maximum permitted
     * difference between the number of matching pods in the target topology
     * and the global minimum.
     * For example, in a 3-zone cluster, MaxSkew is set to 1, and pods with
     * the same labelSelector spread as 1/1/0: | zone1 | zone2 | zone3 | | P | P | |
     * - if MaxSkew is 1, incoming pod can only be scheduled to zone3 to become 1/1/1;
     *   scheduling it onto zone1(zone2) would make the ActualSkew(2-0) on zone1(zone2) violate MaxSkew(1).
     * - if MaxSkew is 2, incoming pod can be scheduled onto any zone.
     * When `whenUnsatisfiable=ScheduleAnyway`, it is used to give higher precedence to topologies that satisfy it.
     * It's a required field. Default value is 1 and 0 is not allowed.
     *
     * @example
     *
     * @defaultValue 1
     */
    maxSkew: number;
    /**
     * The key of node labels.
     *
     * Nodes that have a label with this key and identical values are considered to be in the same topology.
     * We consider each \<key, value\> as a "bucket", and try to put balanced number of pods into each bucket.
     * It's a required field.
     */
    topologyKey: string;

    /**
     * Indicates how to deal with a pod if it doesn't satisfy the spread constraint.
     *
     * - DoNotSchedule (default) tells the scheduler not to schedule it.
     * - ScheduleAnyway tells the scheduler to schedule the pod in any location,
     *   but giving higher precedence to topologies that would help reduce the skew.
     *
     * A constraint is considered "Unsatisfiable" for an incoming pod if and only if every possible
     * node assigment for that pod would violate "MaxSkew" on some topology.
     * For example, in a 3-zone cluster, MaxSkew is set to 1, and pods with the same labelSelector
     * spread as 3/1/1: | zone1 | zone2 | zone3 | | P P P | P | P | If WhenUnsatisfiable is set to DoNotSchedule,
     * incoming pod can only be scheduled to zone2(zone3) to become 3/2/1(3/1/2)
     * as ActualSkew(2-1) on zone2(zone3) satisfies MaxSkew(1).
     * In other words, the cluster can still be imbalanced, but scheduler won't make it
     * *more* imbalanced.
     *
     * It's a required field.
     */
    whenUnsatisfiable: string;
}

/** @public */
export interface KeyToPath {
    /** The key to project. */
    key: string;
    /**
     * mode bits to use on this file,
     * Must be a value between 0 and 0777.
     * If not specified, the volume defaultMode will be used.
     * This might be in conflict with other options that affect the file mode, like fsGroup,
     * and the result can be other mode bits set.
     */
    mode?: number;
    /**
     * The relative path of the file to map the key to.
     *
     * May not be an absolute path. May not contain the path element '..'. May not start with the string '..'.
     */
    path: string;
}

/** @public */
export interface ConfigMapVolumeSource {
    /**
     * mode bits to use on created files by default.
     *
     * Must be a value between 0 and 0777. Defaults to 0644.
     * Directories within the path are not affected by this setting.
     * This might be in conflict with other options that affect the file mode,
     * like fsGroup, and the result can be other mode bits set.
     */
    defaultMode?: number;

    //tslint:disable max-line-length
    /**
     * If unspecified, each key-value pair in the Data field of the referenced ConfigMap will be projected into the volume as a file whose name is the key and content is the value.
     *
     * If specified, the listed keys will be projected into the specified paths, and unlisted keys will not be present.
     * If a key is specified which is not present in the ConfigMap, the volume setup will error unless it is marked optional.
     * Paths must be relative and may not contain the '..' path or start with '..'.
     */
    //tslint:enable max-line-length
    items?: KeyToPath[];

    /**
     * Name of the referent.
     *
     * More info: {@link https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#names}
     */
    name: string | Handle;

    /** Specify whether the ConfigMap or its keys must be defined */
    optional?: boolean;
}

/** @public */
export interface SecretVolumeSource {
    /**
     * mode bits to use on created files by default.
     *
     * Must be a value between 0 and 0777. Defaults to 0644.
     * Directories within the path are not affected by this setting.
     * This might be in conflict with other options that affect the file mode,
     * like fsGroup, and the result can be other mode bits set.
     */
    defaultMode?: number;

    //tslint:disable max-line-length
    /**
     * If unspecified, each key-value pair in the Data field of the referenced Secret will be projected into the volume as a file whose name is the key and content is the value.
     *
     * If specified, the listed keys will be projected into the specified paths,
     * and unlisted keys will not be present. If a key is specified which is not
     * present in the Secret, the volume setup will error unless it is marked optional.
     *
     * Paths must be relative and may not contain the '..' path or start with '..'.
     */
    //tslint:enable max-line-length
    items?: KeyToPath[];

    /** Specify whether the Secret or its keys must be defined */
    optional?: boolean;

    /**
     * Name of the secret in the pod's namespace to use.
     *
     *  More info: {@link https://kubernetes.io/docs/concepts/storage/volumes#secret}
     */
    secretName: string | Handle;
}

/** @public */
export interface EmptyDirVolumeSource {
    /**
     * What type of storage medium should back this directory.
     *
     * The default is "" which means to use the node's default medium.
     * Must be an empty string (default) or Memory.
     * More info: https://kubernetes.io/docs/concepts/storage/volumes#emptydir
     */
    medium: string;
    /**
     * Total amount of local storage required for this EmptyDir volume.
     *
     * The size limit is also applicable for memory medium.
     * The maximum usage on memory medium EmptyDir would be the minimum
     * value between the SizeLimit specified here and the sum of memory limits of all containers in a pod.
     * The default is nil which means that the limit is undefined.
     * More info: {@link http://kubernetes.io/docs/user-guide/volumes#emptydir}
     */
    sizeLimit: string;
}

/**
 * Volumes for {@link k8s.PodProps}
 *
 * @public
 */
export interface Volume {
    /**
     * Volume's name.
     *
     * Must be a DNS_LABEL and unique within the pod.
     *
     * More info: {@link https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#names}
     */
    name: string;
    /**
     * Represents a configMap that should populate this volume
     */
    configMap?: ConfigMapVolumeSource;
    /**
     * EmptyDir represents a temporary directory that shares a pod's lifetime.
     *
     * More info: {@link https://kubernetes.io/docs/concepts/storage/volumes#emptydir}
     *
     */
    emptyDir?: EmptyDirVolumeSource;
    /**
     * Represents a secret that should populate this volume.
     *
     * More info: {@link https://kubernetes.io/docs/concepts/storage/volumes#secret}
     */
    secret?: SecretVolumeSource;
    /** Other k8s volume kinds not typed yet for \@adpt/cloud */
    [key: string]: any;
}

/**
 * Props for the {@link k8s.Pod} component
 *
 * @public
 */
export interface PodProps extends WithChildren {
    /** Information about the k8s cluster (ip address, auth info, etc.) */
    config: ClusterInfo;

    /** k8s metadata */
    metadata: Metadata;

    // tslint:disable max-line-length
    /**
     * Optional duration in seconds the pod may be active on the node relative to StartTime before the system will actively try to mark it failed and kill associated containers.
     *
     * Value must be a positive integer.
     */
    // tslint:enable max-line-length
    activeDeadlineSeconds?: number;

    /** If specified, the pod's scheduling constraints */
    affinity?: Affinity;

    /** AutomountServiceAccountToken indicates whether a service account token should be automatically mounted. */
    automountServiceAccountToken?: boolean;

    /**
     *  Specifies the DNS parameters of a pod.
     *
     *  Parameters specified here will be merged to the generated DNS configuration based on DNSPolicy.
     */
    dnsConfig?: PodDNSConfig;

    /**
     * Set DNS policy for the pod.
     *
     * Valid values are 'ClusterFirstWithHostNet', 'ClusterFirst', 'Default' or 'None'.
     * DNS parameters given in DNSConfig will be merged with the policy selected with DNSPolicy.
     * To have DNS options set along with hostNetwork, you have to specify DNS policy explicitly
     * to 'ClusterFirstWithHostNet'.
     *
     * @defaultValue ClusterFirst
     */
    dnsPolicy: "ClusterFirstWithHostNet" | "ClusterFirst" | "Default" | "None";

    //tslint:disable max-line-length
    /**
     * Indicates whether information about services should be injected into pod's environment variables matching the syntax of Docker links.
     *
     * @defaultValue true
     */
    //tslint:enable max-line-length
    enableServiceLinks: boolean;

    /**
     * An optional list of hosts and IPs that will be injected into the pod's hosts file if specified.
     *
     * This is only valid for non-hostNetwork pods.
     */
    hostAliases?: HostAlias[];

    /**
     * Use the host's ipc namespace.
     * @defaultValue false
     */
    hostIPC: boolean;

    /**
     * Host networking requested for this pod.
     *
     * Use the host's network namespace.
     * If this option is set, the ports that will be used must be specified. Default to false.
     */
    hostNetwork?: boolean;

    /**
     * Use the host's pid namespace.
     * @defaultValue false
     */
    hostPID: boolean;

    /**
     * Specifies the hostname of the Pod.
     *
     * If not specified, the pod's hostname will be set to a system-defined value.
     */
    hostname?: string;

    /**
     * List of references to secrets in the same namespace to use for pulling any of the images used by this PodSpec.
     *
     * If specified, these secrets will be passed to individual puller implementations for them to use.
     * For example, in the case of docker, only DockerConfig type secrets are honored.
     * More info: {@link https://kubernetes.io/docs/concepts/containers/images#specifying-imagepullsecrets-on-a-pod}
     */
    imagePullSecrets?: LocalObjectReference[];

    /**
     * A request to schedule this pod onto a specific node.
     *
     * If it is non-empty, the scheduler simply schedules this pod onto that node,
     * assuming that it fits resource requirements.
     */
    nodeName?: string;

    /**
     * A selector which must be true for the pod to fit on a node.
     *
     * Selector which must match a node's labels for the pod to be scheduled on that node.
     * More info: {@link https://kubernetes.io/docs/concepts/configuration/assign-pod-node/}
     */
    nodeSelector?: NodeSelector;

    /**
     * Overhead represents the resource overhead associated with running a pod for a given RuntimeClass.
     *
     * This field will be autopopulated at admission time by the RuntimeClass admission controller.
     * If the RuntimeClass admission controller is enabled, overhead must not be set in Pod create requests.
     * The RuntimeClass admission controller will reject Pod create requests which have the overhead already set.
     * If RuntimeClass is configured and selected in the PodSpec, Overhead will be set to the value defined in
     * the corresponding RuntimeClass, otherwise it will remain unset and treated as zero.
     *
     * More info: {@link https://git.k8s.io/enhancements/keps/sig-node/20190226-pod-overhead.md}
     *
     * This field is alpha-level as of Kubernetes v1.16, and is only honored by servers that enable
     * the PodOverhead feature.
     * @alpha
     */
    overhead?: unknown;

    /**
     * PreemptionPolicy is the Policy for preempting pods with lower priority.
     *
     * This field is beta-level, gated by the NonPreemptingPriority feature-gate.
     *
     * @defaultValue PreemptLowerPriority
     * @beta
     */
    preemptionPolicy?: "Never" | "PreemptLowerPriority";

    /**
     * The priority various system components use this field to find the priority of the pod.
     *
     * When Priority Admission Controller is enabled, it prevents users from setting this field.
     * The admission controller populates this field from PriorityClassName.
     * The higher the value, the higher the priority.
     */
    priority?: number;

    /**
     * If specified, indicates the pod's priority.
     *
     * "system-node-critical" and "system-cluster-critical" are two special keywords which indicate the highest
     * priorities with the former being the highest priority. Any other name must be defined by creating a PriorityClass
     * object with that name. If not specified, the pod priority will be default or zero if there is no default.
     */
    priorityClassName?: string;

    /**
     *  If specified, all readiness gates will be evaluated for pod readiness.
     *
     *  A pod is ready when all its containers are ready AND all conditions specified
     *  in the readiness gates have status equal to "True"
     *
     *  More info: {@link https://git.k8s.io/enhancements/keps/sig-network/0007-pod-ready%2B%2B.md}
     */
    readinessGates?: PodReadinessGate[];

    /**
     * Restart policy for all containers within the pod.
     *
     * One of Always, OnFailure, Never. Default to Always.
     * More info: {@link https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/#restart-policy}
     *
     * @defaultValue Always
     */
    restartPolicy: "Always" | "OnFailure" | "Never";

    // tslint:disable max-line-length
    /**
     * Refers to a RuntimeClass object in the node.k8s.io group, which should be used to run this pod.
     *
     * If no RuntimeClass resource matches the named class, the pod will not be run.
     * If unset or empty, the "legacy" RuntimeClass will be used, which is an implicit
     * class with an empty definition that uses the default runtime handler.
     *
     * More info: {@link https://git.k8s.io/enhancements/keps/sig-node/runtime-class.md}
     *
     * This is a beta feature as of Kubernetes v1.14.
     */
    runtimeClassName?: string;
    // tslint:enable max-line-length

    /**
     *  If specified, the pod will be dispatched by specified scheduler.
     *  If not specified, the pod will be dispatched by default scheduler.
     */
    schedulerName?: string;

    /**
     * SecurityContext holds pod-level security attributes and common container settings.
     * See type description for default values of each field.
     *
     * @defaultValue \{\}
     */
    securityContext: PodSecurityContext;

    /**
     * ServiceAccountName is the name of the ServiceAccount to use to run this pod.
     * More info: {@link https://kubernetes.io/docs/tasks/configure-pod-container/configure-service-account/}
     */
    serviceAccountName?: string;

    /**
     * If true the pod's hostname will be configured as the pod's FQDN, rather than the leaf name (the default).
     * In Linux containers, this means setting the FQDN in the hostname field of the kernel
     * (the nodename field of struct utsname).
     * In Windows containers, this means setting the registry value of hostname for the registry key
     * HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters to FQDN.
     * If a pod does not have FQDN, this has no effect.
     *
     * @defaultValue false
     */
    setHostnameAsFQDN?: boolean;

    /**
     * Share a single process namespace between all of the containers in a pod.
     * When this is set containers will be able to view and signal processes from other containers in the same pod,
     * and the first process in each container will not be assigned PID 1.
     * HostPID and ShareProcessNamespace cannot both be set.
     *
     * @defaultValue false
     */
    shareProcessNamespace: boolean;

    // tslint:disable max-line-length
    /**
     *  If specified, the fully qualified Pod hostname will be "\<hostname\>.\<subdomain\>.\<pod namespace\>.svc.\<cluster domain\>".
     *  If not specified, the pod will not have a domainname at all.
     */
    subdomain?: string;
    // tslint:enable max-line-length

    /**
     * Optional duration in seconds the pod needs to terminate gracefully.
     *
     * May be decreased in delete request. Value must be non-negative integer.
     * The value zero indicates delete immediately. If this value is nil, the default
     * grace period will be used instead. The grace period is the duration in seconds
     * after the processes running in the pod are sent a termination signal and the time
     * when the processes are forcibly halted with a kill signal. Set this value longer
     * than the expected cleanup time for your process. Defaults to 30 seconds.
     */
    terminationGracePeriodSeconds?: number;

    /** If specified, the pod's tolerations. */
    tolerations?: Toleration[];
    /**
     *  TopologySpreadConstraints describes how a group of pods ought to spread across topology domains.
     *
     *  Scheduler will schedule pods in a way which abides by the constraints. All topologySpreadConstraints are ANDed.
     */
    topologySpreadConstraints?: TopologySpreadConstraint[];

    /**
     * List of volumes that can be mounted by containers belonging to the pod.
     *
     * More info: {@link https://kubernetes.io/docs/concepts/storage/volumes}
     */
    volumes?: Volume[];
}

function isContainerArray(children: any[]): children is AdaptElement<K8sContainerProps>[] {
    const badKids = children.filter((c) => !isElement(c) || !isK8sContainerElement(c));
    if (badKids.length === 0) return true;
    const names = badKids.map((c) => isElement(c) ? c.componentName : String(c));
    throw new BuildNotImplemented(`Pod children must be of type ` +
        `${K8sContainer.name}. Invalid children are: ${names.join(", ")}`);
}

function dups<T>(data: T[]): T[] {
    const grouped = ld.groupBy(data, ld.identity);
    const filtered = ld.filter(grouped, (val) => val.length > 1);
    return ld.uniq(ld.flatten(filtered));
}

function defaultize(spec: ContainerSpec): ContainerSpec {
    spec = { ...spec };
    if (spec.env && spec.env.length === 0) delete spec.env;
    if (spec.tty !== true) delete spec.tty;
    if (spec.ports && spec.ports.length === 0) delete spec.ports;
    if (spec.ports) {
        spec.ports = spec.ports.map(
            (p) => p.protocol ? p : { ...p, protocol: "TCP" });
    }
    return spec;
}

/** @internal */
export function makePodManifest(props: PodProps & BuiltinProps, volumes: Volume[] | undefined) {
    const { key, handle, metadata, config, children, volumes: origVolumes, ...propsLL } = props;
    const containers = ld.compact(
        childrenToArray(props.children)
            .map((c) => isK8sContainerElement(c) ? c : null));

    const spec: PodSpec = {
        ...propsLL,
        containers: containers.map((c) => ({
            args: c.props.args,
            command: c.props.command, //FIXME(manishv)  What if we just have args and no command?
            env: c.props.env,
            image: c.props.image,
            imagePullPolicy: c.props.imagePullPolicy,
            name: c.props.name,
            ports: c.props.ports,
            tty: c.props.tty,
            workingDir: c.props.workingDir,
        }))
            .map(defaultize)
            .map(removeUndef),
        volumes
    };

    return {
        kind: "Pod",
        metadata: props.metadata,
        spec,
    };
}

interface ResolvedVolumes {
    volumes?: Volume[];
}

function resolveMappedVolumeHandle(vol: Volume, deployID: string, toResolve: { [key: string]: { field: string } }) {
    for (const key in toResolve) {
        if (!Object.hasOwnProperty.call(toResolve, key)) continue;
        if (vol[key] === undefined) continue;
        const field = toResolve[key].field;
        const h = vol[key][field];
        if (!isHandle(h)) return vol;

        const target = h.target;
        if (!isMountedElement(target) && target !== null) {
            return {
                ...vol,
                [key]: {
                    ...vol[key],
                    [field]: `adapt-unresolved-${key}`,
                    // Make sure we force k8s to wait for the handle to resolve
                    optional: false,
                }
            };
        }

        if (target === null) {
            return {
                ...vol,
                [key]: {
                    [field]: `adapt-null-${key}`,
                    // Make the volume optional so k8s skips it
                    optional: true,
                }
            };
        }

        if (!isResource(target)) {
            throw new Error(`Cannot have a non-resource handle target for a ${key} volume ${field}`);
        }

        const props = (target as AdaptElement<ResourceProps>).props;
        if (key.toLowerCase() !== props.kind.toLowerCase()) {
            throw new Error(`Cannot use handle to ${props.kind} as reference in ${key}`);
        }

        return {
            ...vol,
            [key]: {
                ...vol[key],
                [field]: resourceElementToName(target, deployID),
            }
        };
    }
    return vol;
}

function resolveVolumeHandles(volumes: Volume[] | undefined, deployID: string) {
    if (volumes === undefined) return {};
    return {
        volumes: volumes.map((vol)  => resolveMappedVolumeHandle(
            vol,
            deployID,
            { configMap: { field: "name" },
              secret: { field: "secretName" }
            }))
    };
}

/**
 * Component for Kubernetes Pods
 *
 * @public
 */
export class Pod extends DeferredComponent<PodProps, ResolvedVolumes> {
    static defaultProps = {
        metadata: {},
        dnsPolicy: "ClusterFirst",
        enableServiceLinks: true,
        hostIPC: false,
        hostPID: false,
        restartPolicy: "Always",
        securityContext: {},
        shareProcessNamespace: false,
        terminationGracePeriodSeconds: 30,
    };

    initialState() { return {}; }

    build(helpers: BuildHelpers) {
        this.setState(() => resolveVolumeHandles(this.props.volumes, helpers.deployID));
        const { key } = this.props;
        if (!key) throw new InternalError("key is null");
        const children = childrenToArray(this.props.children);

        if (ld.isEmpty(children)) return null;
        if (!isContainerArray(children)) return null;

        const containerNames = children.map((child) => child.props.name);
        const dupNames = dups(containerNames);
        if (!ld.isEmpty(dupNames)) {
            throw new BuildNotImplemented(`Duplicate names within a pod: ${dupNames.join(", ")}`);
        }

        const manifest = makePodManifest(this.props as PodProps & BuiltinProps, this.state.volumes);
        return (<Resource
            key={key}
            config={this.props.config}
            kind="Pod"
            metadata={manifest.metadata}
            spec={manifest.spec} />);
    }

    async status(_observe: ObserveForStatus, buildData: BuildData) {
        const succ = buildData.successor;
        if (!succ) return undefined;
        return succ.status();
    }
}

/**
 * Tests whether x is a Pod element
 *
 * @param x - value to test
 * @returns `true` if x is a Pod element, false otherwise
 *
 * @public
 */
export function isPod(x: any): x is AdaptElement<PodProps> {
    if (!isElement(x)) return false;
    if (x.componentType === Pod) return true;
    return false;
}

/*
 * Plugin info
 */

/**
 * Spec for for Kubernetes Pods
 *
 * @public
 */
export interface PodSpec extends Omit<PodProps, "config" | "metadata"> {
    containers: ContainerSpec[];
    terminationGracePeriodSeconds?: number;
}

function deployedWhen(statusObj: unknown) {
    const status: any = statusObj;
    if (!status || !status.status) return waiting(`Kubernetes cluster returned invalid status for Pod`);
    if (status.status.phase === "Running") return true;
    let msg = `Pod state ${status.status.phase}`;
    if (Array.isArray(status.status.conditions)) {
        const failing = status.status.conditions
            .filter((cond: any) => cond.status !== "True")
            .map((cond: any) => cond.message)
            .join("; ");
        if (failing) msg += `: ${failing}`;
    }
    return waiting(msg);
}

/** @internal */
export const podResourceInfo = {
    kind: "Pod",
    deployedWhen,
    statusQuery: async (props: ResourceProps, observe: ObserveForStatus, buildData: BuildData) => {
        const obs: any = await observe(K8sObserver, gql`
            query ($name: String!, $kubeconfig: JSON!, $namespace: String!) {
                withKubeconfig(kubeconfig: $kubeconfig) {
                    readCoreV1NamespacedPod(name: $name, namespace: $namespace) @all(depth: 100)
                }
            }`,
            {
                name: resourceIdToName(props.key, buildData.id, buildData.deployID),
                kubeconfig: props.config.kubeconfig,
                namespace: computeNamespaceFromMetadata(props.metadata)
            }
        );
        return obs.withKubeconfig.readCoreV1NamespacedPod;
    },
};

registerResourceKind(podResourceInfo);
