/*
 * Copyright 2018-2021 Unbounded Systems, LLC
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

import { BuildData, ObserveForStatus } from "@adpt/core";
import { DockerSplitRegistryInfo } from "../docker";
import { DaemonSetSpec } from "./DaemonSet";
import { DeploymentSpec } from "./Deployment";
import { PodSpec } from "./Pod";
import { ServiceSpec } from "./Service";

/**
 * Kubernetes Kind
 *
 * @public
 */
export type Kind = string;

/** @public */
export interface CRSpec {
    [key: string]: any;
}

/** @public */
export type Spec =
    DaemonSetSpec |
    DeploymentSpec |
    PodSpec |
    ServiceSpec |
    CRSpec;

/** @public */
export interface Metadata {
    namespace?: string;
    labels?: { [key: string]: string };
    annotations?: { [key: string]: string };
}

/** @public */
export type ResourceProps = { key: string } & (
    ResourceClusterRole |
    ResourceClusterRoleBinding |
    ResourceDaemonSet |
    ResourcePod |
    ResourceService |
    ResourceServiceAccount |
    ResourceConfigMap |
    ResourceSecret |
    ResourceCR
);

/** @public */
export type ResourcePropsWithConfig = ResourceProps & { config: ClusterInfo };

/** @public */
export interface ResourceInfo {
    kind: Kind;
    statusQuery?: (props: ResourceProps, observe: ObserveForStatus, buildData: BuildData) => unknown | Promise<unknown>;
    specsEqual(actual: Spec, element: Spec): boolean;
}

/**
 * Holds the information needed to connect, authenticate, and run code in a kuberenetes cluster
 *
 * @public
 */
export interface ClusterInfo {
    /** Javascript object formed by parsing a valid kubeconfig file */
    kubeconfig: Kubeconfig;
    /**
     * Registry to which Docker images used by the cluster in `kubeconfig` should be pushed and pulled
     *
     * @remarks
     * If `registryPrefix` is a string, it is assumed that the cluster can pull from the same string
     * that outsiders can push to.
     *
     * If `registryPrefix` is of the form `{ external: string, internal: string }` then the `external`
     * string will be used to push images, and the `internal` string will be used to pull images.
     *
     * Note(manishv)
     * This is a bit of a hack to allow one hostname or IP address to push images from outside
     * a particular environment (say k8s) and a different URL for that environment to pull
     * images.
     *
     * A good example of this is a k3s-dind (k3s docker-in-docker) instance of kubernetes where
     * a private registry is running on a docker network attached to the k3s-dind instance, but where we
     * want to push {@link docker.LocalDockerImage} built images to that registry.  Since
     * {@link docker.LocalDockerImage | LocalDockerImage} is outside the k3s-dind environment, it must
     * use a host accessible network to push to the registry.  However, since the k3s-dind instance sees
     * the registry from within Docker, it must use a different address to pull the images for use.
     *
     * Once network scopes are fully supported, this interface will change to whatever is appropriate.  It
     * is best if you can arrange to have the same URL or registry string work for all access regardless
     * of which network the registry, Adapt host, and ultimate container running environment uses.
     *
     */
    registryPrefix?: string | DockerSplitRegistryInfo;
}

/** @public */
export interface ResourceBase {
    /**
     * config to connect to the k8s cluster
     *
     * required if isTemplate is false
     */
    config?: ClusterInfo;
    /**
     * Specifies whether this resource is just a template for use in a controller
     */
    isTemplate?: boolean;
    apiVersion?: string;
    kind: Kind;
    metadata?: Metadata;
}

/**
 * @public
 */
export interface PolicyRule {
    /**
     * APIGroups is the name of the APIGroup that contains the resources.
     *
     * If multiple API groups are specified, any action requested against one
     * of the enumerated resources in any API group will be allowed.
     */
    apiGroups?: string[];
    /**
     * NonResourceURLs is a set of partial urls that a user should have access to.
     *
     * *s are allowed, but only as the full, final step in the path.
     * Since non-resource URLs are not namespaced, this field is only applicable
     * for ClusterRoles referenced from a ClusterRoleBinding.
     * Rules can either apply to API resources (such as "pods" or "secrets") or
     * non-resource URL paths (such as "/api"), but not both.
     */
    nonResourceURLs?: string[];
    /**
     * ResourceNames is an optional white list of names that the rule applies to.
     *
     * An empty set means that everything is allowed.
     */
    resourceNames?: string[];
    /**
     * Resources is a list of resources this rule applies to.
     *
     * ResourceAll represents all resources.
     */
    resources: string[];
    /**
     * Verbs is a list of Verbs that apply to ALL the ResourceKinds and
     * AttributeRestrictions contained in this rule.
     *
     * VerbAll represents all kinds.
     */
    verbs: string[];
}

/**
 * AggregationRule for {@link k8s.ClusterRole}
 *
 * @public
 */
export interface AggregationRule {
    /**
     * ClusterRoleSelectors holds a list of selectors which will be used to
     * find ClusterRoles and create the rules.
     *
     * If any of the selectors match, then the ClusterRole's permissions will be added
     */
    clusterRoleSelector: LabelSelector;
}

/** @public */
export interface ResourceClusterRole extends ResourceBase {
    apiVersion: "rbac.authorization.k8s.io/v1";
    kind: "ClusterRole";
    aggregationRule?: AggregationRule;
    rules?: PolicyRule[];
}

/**
 * RoleRef for {@link k8s.ResourceClusterRoleBinding}
 *
 * @public
 */
export interface RoleRef {
    /** apiGroup is the group for the resource being referenced */
    apiGroup: string;
    /** kind is the type of resource being referenced */
    kind: string;
    /** Name is the name of resource being referenced */
    name: string;
}

/**
 * Subject for {@link k8s.ResourceClusterRoleBinding}
 *
 * @public
 */
export interface Subject {
    /** apiGroup is the group for the object being referenced */
    apiGroup: string;
    /** kind is the type of object being referenced */
    kind: string;
    /**
     * Name of the object being referenced.
     */
    name: string;
    /**
     * Namespace of the referenced object.
     *
     * If the object kind is non-namespace, such as "User" or "Group", and this value
     * is not empty the Authorizer should report an error.
     */
    namespace?: string;
}

/** @public */
export interface ResourceClusterRoleBinding extends ResourceBase {
    apiVersion: "rbac.authorization.k8s.io/v1";
    kind: "ClusterRoleBinding";
    roleRef: RoleRef;
    subjects: Subject[];
}

/** @public */
export interface ResourceDaemonSet extends ResourceBase {
    apiVersion: "apps/v1";
    kind: "DaemonSet";
    spec: DaemonSetSpec;
}

/** @public */
export interface ResourcePod extends ResourceBase {
    kind: "Pod";
    spec: PodSpec;
}

/** @public */
export interface ResourceService extends ResourceBase {
    kind: "Service";
    spec: ServiceSpec;
}

/** @public */
export interface ResourceServiceAccount extends ResourceBase {
    kind: "ServiceAccount";
    automountServiceAccountToken?: boolean;
    imagePullSecrets?: { name: string }[];
    secrets?: ObjectReference[];
}

/** @public */
export interface ResourceConfigMap extends ResourceBase {
    kind: "ConfigMap";
    binaryData?: { [key: string]: string };
    data?: { [key: string]: string };
    /** @beta */
    immutable?: boolean;
}

/** @public */
export interface ResourceSecret extends ResourceBase {
    kind: "Secret";
    data?: { [key: string]: string };
    stringData?: { [key: string]: string };
    type?: string;
}

/** @public */
export interface ResourceCR extends ResourceBase {
    kind: string;
    spec: CRSpec;
}

/** @public */
export function computeNamespaceFromMetadata(metadata?: Metadata) {
    if (!metadata) return "default";
    if (!metadata.namespace) return "default";
    return metadata.namespace;
}

/** @public */
export interface Kubeconfig {
    apiVersion?: "v1";
    kind: "Config";
    "current-context": string;
    contexts: {
        name: string,
        context: {
            cluster: string,
            user: string
        }
    }[];
    clusters: {
        name: string,
        cluster: {
            "certificate-authority-data": string;
            server: string;
        };
    }[];
    preferences?: unknown;
    users: {
        name: string,
        user: {
            "client-certificate-data"?: string;
            "client-key-data"?: string;
            "username"?: string;
            "password"?: string;
        }
    }[];
}

/**
 * LabelSelectorRequirement used in {@link k8s.LabelSelector}
 *
 * @public
 */
interface LabelSelectorRequirement {
    /**
     * key is the label key that the selector applies to.
     *
     * patch strategy: merge
     * patch merge key: key
     */
    key: string;

    /**
     * operator represents a key's relationship to a set of values.
     * Valid operators are In, NotIn, Exists and DoesNotExist.
     */
    operator: string;
    /**
     * values is an array of string values.
     * If the operator is In or NotIn, the values array must be non-empty.
     * If the operator is Exists or DoesNotExist, the values array must be empty.
     * This array is replaced during a strategic merge patch.
     */
    values: string[];
}
/** @public */

export function isLabelSelector(x: any): x is LabelSelector {
    return x.matchLabels != null || x.matchExpressions != null;
}

/** @public */
export interface LabelSelector {
    /**
     * matchExpressions is a list of label selector requirements. The requirements are ANDed.
     */
    matchExpressions?: LabelSelectorRequirement[];
    /**
     * matchLabels is a map of `{key,value}`pairs. A single `{key,value}` in the matchLabels map
     * is equivalent to an element of matchExpressions, whose key field is "key", the operator
     * is "In", and the values array contains only "value". The requirements are ANDed.
     */
    matchLabels?: { [key: string]: string };
}

/** @public */
export interface LocalObjectReference {
    /**
     * Name of the referent.
     *
     * More info: {@link https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#names}
     */
    name: string;
}

/**
 * PodTemplateSpec from k8s API
 *
 * @public
 */
export interface PodTemplateSpec {
    /**
     * Standard object's metadata.
     * More Info: {@link https://git.k8s.io/community/contributors/devel/sig-architecture/api-conventions.md#metadata}
     */
    metadata: Metadata;
    // tslint:disable: max-line-length
    /**
     * Specification of the desired behavior of the pod.
     * More Info: {@link https://git.k8s.io/community/contributors/devel/sig-architecture/api-conventions.md#spec-and-status}
     */
    // tslint:enable: max-line-length
    spec: PodSpec;
}

/**
 * ObjectReference from k8s API
 *
 * @public
 */
export interface ObjectReference {
    /**
     * If referring to a piece of an object instead of an entire object,
     * this string should contain a valid JSON/Go field access statement,
     * such as desiredState.manifest.containers[2].
     *
     * For example, if the object reference is to a container within a pod,
     * this would take on a value like: "spec.containers\{name\}" (where "name"
     * refers to the name of the container that triggered the event) or if no
     * container name is specified "spec.containers[2]"
     * (container with index 2 in this pod).
     * This syntax is chosen only to have some well-defined way of referencing a
     * part of an object.
     */
    fieldPath: string;
    /**
     * Name of the referent.
     *
     * More info: {@link https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#names}
     *
     */
    name: string;
    /**
     * Namespace of the referent.
     *
     * More info: {@link https://kubernetes.io/docs/concepts/overview/working-with-objects/namespaces/}
     */
    namespace: string;
    // tslint:disable: max-line-length
    /**
     * Specific resourceVersion to which this reference is made, if any.
     *
     * More info: {@link https://git.k8s.io/community/contributors/devel/sig-architecture/api-conventions.md#concurrency-control-and-consistency}
     */
    // tslint:enable: max-line-length
    resourceVersion: string;
    /**
     * UID of the referent.
     *
     * More info: {@link https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#uids}
     */
    uid: string;
}
