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

import { toArray } from "@adpt/utils";
import { flatten } from "lodash";
import { Handle, isHandle } from "../handle";
import { isMountedElement } from "../jsx";
import {
    Dependency,
    DeployHelpers,
    Relation,
    RelationExt,
    Waiting,
    WaitStatus,
} from "./deploy_types";

const isWaiting = (val: true | Waiting | Waiting[]): val is Waiting | Waiting[] =>
    val !== true;

export const relationIsReadyStatus = (rels: Relation | Relation[]) => {
    const status = (r: Relation) => r.ready(r.relatesTo || []);
    rels = toArray(rels);
    const notReady = flatten(rels.map(status).filter(isWaiting));
    return notReady.length === 0 ? true :
        notReady.length === 1 ? notReady[0] :
        notReady;
};
export const relationIsReady = (r: Relation) => relationIsReadyStatus(r) === true;

export const relationInverse = (r: Relation): Relation => {
    const relatesTo = r.relatesTo ?
        r.relatesTo.map((a) => relationInverse(a)) : [];
    if (r.inverse) return r.inverse(relatesTo);
    return { ...r, relatesTo };
};

export const relationToString = (r: Relation, indent = ""): string => {
    if (Object.prototype.hasOwnProperty.call(r, "toString") && r.toString) {
        return r.toString(indent);
    }
    const relatesTo = r.relatesTo || [];
    const args = relatesTo.length === 0 ? "" :
        `\n${relatesTo.map((a) => relationToString(a, indent + "  ")).join(",\n")}\n${indent}`;
    return `${indent}${r.description}(${args})`;
};

export const waitStatusToString = (s: WaitStatus) =>
    s === true ? "Ready" :
    !Array.isArray(s) ? s.status :
    [ "Waiting for:", ...s.map((w) => w.status) ].join("\n");

export function depName(d: Dependency) {
    if (isHandle(d)) {
        const target = d.target;
        if (target) {
            let id = isMountedElement(target) ? target.id : target.componentName;
            if (d.name) id += ` (${d.name})`;
            return id;
        }
        if (d.name) return `Handle(${d.name})`;
        return d.toString();
    }
    return `Dep(${d.description})`;
}

export const toRelation = (h: DeployHelpers, d: Dependency) =>
    isHandle(d) ? h.dependsOn(d) : d;

export function relatedHandles(rel: RelationExt): Handle[] {
    const handles = new Set<Handle>();
    const deps = (r: RelationExt) => {
        toDependencies(r).forEach((d) => {
            if (isHandle(d)) handles.add(d);
            else deps(d);
        });
    };
    deps(rel);
    return [...handles];
}

export const toDependencies = (r: RelationExt) =>
    r.toDependencies ? r.toDependencies() : r.relatesTo || [];

export const nDepends = (count: number) =>
    count === 1 ? `1 dependency` : `${count} dependencies`;
