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

import { K8sObserver } from "../../src/k8s/k8s_observer";

export function forceK8sObserverSchemaLoad(): void {
    (new K8sObserver()).schema;
}

export interface K8sTestStatusType {
    //Why is this needed?  Without, typescript will complain (at use) that this has nothing in common with Status
    noStatus?: true;
    kind: string;
    metadata: {
        name: string;
        annotations: { [key: string]: any }
        labels?: { [key: string]: any }
    };
}

const k8sSytemPodNames = [
    "coredns",
    "kube-addon-manager",
    "kube-dns",
    "local-path-provisioner",
    "metrics-server",
    "storage-provisioner",
];

export const k8sSystemPodNameRegex = RegExp(
    "(^" +
    k8sSytemPodNames.map((n) => `(?:${n})`).join("|") +
    ")-[a-z\\-0-9]+$"
);
