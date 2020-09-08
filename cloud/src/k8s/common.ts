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

import { BuildData, ObserveForStatus } from "@adpt/core";
import { DockerSplitRegistryInfo } from "../docker";
import { DaemonSetSpec } from "./DaemonSet";
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
    ResourceDaemonSet |
    ResourcePod |
    ResourceService |
    ResourceConfigMap |
    ResourceCR
);

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
     * URL or string to which Docker images used by the cluster in `kubeconfig` should be pushed and pulled
     *
     * @remarks
     * If `registryUrl` is a string, it is assumed that the cluster can pull from the same string
     * that outsiders can push to.
     *
     * If `registryUrl` is of the form `{ external: string, internal: string }` then the `external`
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
     */
    registryUrl?: string | DockerSplitRegistryInfo;
}

/** @public */
export interface ResourceBase {
    config: ClusterInfo;
    apiVersion?: string;
    kind: Kind;
    metadata?: Metadata;
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
export interface ResourceConfigMap extends ResourceBase {
    kind: "ConfigMap";
    binaryData?: { [key: string]: string };
    data?: { [key: string]: string };
    /** @beta */
    immutable?: boolean;
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
