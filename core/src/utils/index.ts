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

export * from "./trace";

/**
 * Create a new, empty object and copy only the selected properties from a
 * source object onto the new object.
 * @param srcObj The source object from which to copy properties.
 * @param propList An array of names of properties to copy.
 * @returns The newly created object that contains only the selected properties
 */
export function filterProperties<T extends object, K extends keyof T>(
    srcObj: T, propList: K[]
): Pick<T, K> {
    const destObj = Object.create(null);

    for (const prop of propList) {
        if (srcObj[prop] !== undefined) destObj[prop] = srcObj[prop];
    }
    return destObj;
}
