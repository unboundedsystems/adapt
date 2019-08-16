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

import * as ld from "lodash";
import { sortArray } from "./sort_arrays";

const sorted = Symbol();

// LoDash isEqualWith says that a true comparison means equal, false means unequal, and undefined means
// I don't know, do the normal isEqual thing at this level.
function compareArrays(x: unknown, y: unknown): boolean | undefined {
    if (!ld.isArray(x)) return;
    if (!ld.isArray(y)) return;
    if ((x as any)[sorted] && (y as any)[sorted]) return;
    if (x.length !== y.length) return false;
    const xClone = ld.cloneDeep(x);
    const yClone = ld.cloneDeep(y);
    sortArray(xClone); //FIXME(manishv) sortArrays does a json stable stringify which will make this very slow
    sortArray(yClone);
    (xClone as any)[sorted] = true;
    (yClone as any)[sorted] = true;
    return ld.isEqualWith(xClone, yClone, compareArrays);
}

/**
 * Given two values, this will do a deep comparison like lodash isEqual, but
 * will compare array properties as if order does not matter.
 * @param obj first object to be compared
 * @param other object to comapre to.
 */
export function isEqualUnorderedArrays(obj: unknown, other: unknown): boolean {
    return ld.isEqualWith(obj, other, compareArrays);
}
