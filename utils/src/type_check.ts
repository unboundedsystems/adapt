/*
 * Copyright 2018 Unbounded Systems, LLC
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

import { isObject } from "lodash";
import { CustomError } from "ts-custom-error";

export class ValidationError extends CustomError {
    public constructor(typeName: string, message?: string) {
        let m = `Error validating ${typeName}`;
        if (message) m += ": " + message;
        super(m);
    }
}

interface PropList {
    [prop: string]: string; // typeof prop
}

function validProp(parentType: string, parent: any, prop: string, typeofProp: string, doThrow: boolean) {
    if (parent[prop] == null) {
        if (doThrow) throw new ValidationError(parentType, `${typeofProp} property '${prop}' is missing`);
        return false;
    }
    if (typeof parent[prop] !== typeofProp) {
        if (doThrow) throw new ValidationError(parentType, `property '${prop}' is not a ${typeofProp}`);
        return false;
    }
    return true;
}

function validProps(parentType: string, parent: any, props: PropList, doThrow: boolean) {
    if (parent == null || !isObject(parent)) {
        if (doThrow) throw new ValidationError(parentType, `not a valid object`);
        return false;
    }
    for (const prop of Object.keys(props)) {
        if (!validProp(parentType, parent, prop, props[prop], doThrow)) return false;
    }
    return true;
}

/**
 * Validates whether properties on obj conform to propList.
 * Throws ValidationError on failure.
 */
export function validateProps(expectedObjTypeName: string, obj: unknown, propList: PropList) {
    validProps(expectedObjTypeName, obj, propList, true);
}

/**
 * Returns true if obj has properties that conform to propList. False otherwise.
 */
export function hasValidProps(obj: unknown, propList: PropList) {
    return validProps("unused", obj, propList, false);
}
