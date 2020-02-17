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

import {
    AdaptElement,
    Handle,
    isHandle,
    isMountedElement,
} from "@adpt/core";
import { sha256hex } from "@adpt/utils";
import AWS from "./aws-sdk";

import { CFResourceProps, isCFResourcePrimitiveElement } from "./CFResource";

export interface Tagged {
    Tags?: AWS.EC2.Tag[];
}

export const adaptDeployIdTag = "adapt:deployID";
export const adaptStackIdTag = "adapt:stackID";
export const adaptResourceIdTag = "adapt:resourceID";

export function addTag(input: Tagged, tag: string, value: string) {
    if (input.Tags == null) input.Tags = [];
    for (const t of input.Tags) {
        if (t.Key === tag) {
            t.Value = value;
            return;
        }
    }
    input.Tags.push({
        Key: tag,
        Value: value,
    });
}

export function getTag(obj: Tagged, tag: string) {
    if (obj.Tags) {
        for (const t of obj.Tags) {
            if (t.Key === tag) return t.Value;
        }
    }
    return undefined;
}

export function adaptResourceId(elemOrHandle: AdaptElement<CFResourceProps> | Handle): string {
    const el = isHandle(elemOrHandle) ? elemOrHandle.target : elemOrHandle;
    if (el == null) {
        throw new Error(`Cannot get a CloudFormation resource ID ` +
            `for an unassociated handle`);
    }
    if (!isCFResourcePrimitiveElement(el)) {
        throw new Error(`Cannot get a CloudFormation resource ID for an ` +
            `element that is not a CFResourcePrimitive`);
    }

    return adaptIdFromElem(el.props.Type, el);
}

export function adaptIdFromElem(prefix: string, el: AdaptElement<{}>): string {
    if (!isMountedElement(el)) {
        throw new Error("Can only compute name of mounted elements");
    }
    return adaptId(prefix, el.id);
}

export function adaptId(prefix: string, elementId: string): string {
    const replaceRe = /[^a-z0-9]/ig;
    const name = prefix + sha256hex(elementId).slice(0, 32);
    // Remove all invalid chars
    return name.replace(replaceRe, "");
}
