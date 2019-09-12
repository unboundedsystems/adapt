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

import { BuildData, ObserveForStatus, WithChildren } from "@adpt/core";
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
    ResourcePod |
    ResourceService |
    ResourceCR
);

/** @public */
export interface ResourceInfo {
    kind: Kind;
    apiName: string;
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
    /** URL to which Docker images used by the cluster in `kubeconfig` should be pushed */
    registryUrl?: string;
}

/** @public */
export interface ResourceBase {
    config: ClusterInfo;
    kind: Kind;
    metadata?: Metadata;
}

/** @public */
export interface ResourcePod extends ResourceBase, WithChildren {
    kind: "Pod";
    spec: PodSpec;
}

/** @public */
export interface ResourceService extends ResourceBase {
    kind: "Service";
    spec: ServiceSpec;
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
    kind: "Config";
    "current-context": string;
    contexts: [{
        name: string,
        context: {
            cluster: string,
            user: string
        }
    }];
    clusters: [{
        name: string,
        cluster: {
            "certificate-authority-data": string;
            server: string;
        };
    }];
    users: [{
        name: string,
        user: {
            "client-certificate-data"?: string;
            "client-key-data"?: string;
            "username"?: string;
            "password"?: string;
        }
    }];
}
