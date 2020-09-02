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

import {
    AdaptElement,
    AnyProps,
    BuildData,
    GoalStatus,
    isMountedElement,
    ObserveForStatus,
    WaitStatus,
} from "@adpt/core";

import { makeResourceName } from "../common";
import { Kind, Metadata, ResourceProps, Spec } from "./common";
import { isResourceFinalElement } from "./Resource";

interface MetadataInRequest extends Metadata {
    name: string;
}

export interface ResourceInfo {
    kind: Kind;
    deployedWhen: (statusObj: unknown, goalStatus: GoalStatus) => WaitStatus;
    statusQuery?: (props: ResourceProps, observe: ObserveForStatus, buildData: BuildData) => any | Promise<any>;
}

const resourceInfo = new Map<string, ResourceInfo>();

export function getResourceInfo(kind: string): ResourceInfo {
    const info = resourceInfo.get(kind);
    if (!info) throw new Error(`Request for ResourceInfo for unknown kind: ${kind}`);
    return info;
}

export function registerResourceKind(info: ResourceInfo) {
    const old = resourceInfo.get(info.kind);
    if (old !== undefined) throw new Error(`Attempt to register duplicate kind "${info.kind}"`);
    resourceInfo.set(info.kind, info);
}

export interface Manifest {
    apiVersion: "v1" | "apps/v1" | string;
    kind: Kind;
    metadata: MetadataInRequest;
    spec: Spec;
}

export const resourceIdToName = makeResourceName(/[^a-z-]/g, 63);
const deployIDToLabelInner = makeResourceName(/[^a-z0-9-]/g, 63);
export const deployIDToLabel = (id: string) => deployIDToLabelInner(id, "", id);

export function resourceElementToName(
    elem: AdaptElement<AnyProps>,
    deployID: string
): string {
    if (!isResourceFinalElement(elem)) throw new Error("Can only compute name of Resource elements");
    if (!isMountedElement(elem)) throw new Error("Can only compute name of mounted elements");
    return resourceIdToName(elem.props.key, elem.id, deployID);
}

export function makeManifest(elem: AdaptElement<ResourceProps>, deployID: string): Manifest {
    if (!isMountedElement(elem)) throw new Error("Can only create manifest for mounted elements!");

    const name = resourceElementToName(elem, deployID);
    const ret: Manifest = {
        apiVersion: elem.props.apiVersion || "v1",
        kind: elem.props.kind,
        metadata: {
            ...elem.props.metadata,
            name
        },
        spec: elem.props.spec
    };

    if (ret.metadata.annotations === undefined) ret.metadata.annotations = {};
    const labels = ret.metadata.labels;
    ret.metadata.labels = {
        ...(labels ? labels : {}),
        adaptName: name,
        adaptDeployID: deployIDToLabel(deployID),
    };
    ret.metadata.annotations.adaptName = elem.id;
    ret.metadata.annotations.adaptDeployID = deployID;

    return ret;
}
