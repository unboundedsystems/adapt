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

import stringify from "json-stable-stringify";

export type ArrayKeys<T> = { [K in keyof T]: Required<T>[K] extends any[] ? K : never }[keyof T];

/**
 * Given an object, will sort any properties of that object that are arrays.
 * The sort of each array happens in-place, modifying the original arrays.
 * @param obj An object whose array properties will be sorted
 * @param keys  The specific property names to sort
 */
export function sortArraysInObject<T extends object>(
    obj: T,
    keysIn?: ArrayKeys<T>[],
    ignoreNonArrays: boolean = false): void {

    let keys: string[];
    keys = keysIn ? keysIn.map((v) => v.toString()) : Object.keys(obj);
    if (!keysIn) ignoreNonArrays = true;

    for (const k of keys) {
        const arr = (obj as any)[k];
        if (arr === undefined) continue;
        if (!Array.isArray(arr)) {
            if (ignoreNonArrays) {
                continue;
            } else {
                throw new Error(`Unable to sort non-array (key=${k})`);
            }
        }
        if (arr.length === 0) continue;
        sortArray(arr);
    }
}

export function sortArray<T>(arr: T[]): T[] {
    if (typeof arr[0] === "string") arr.sort();
    else {
        arr.sort((a, b) => {
            const aS = stringify(a);
            const bS = stringify(b);
            return a === b ? 0 :
                aS < bS ? -1 : 1;
        });
    }
    return arr;
}
