/*
 * Copyright 2020 Unbounded Systems, LLC
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

import { AnyObject } from "./common_types";

const $processGlobals = Symbol.for("$processGlobals");

if (!(process as any)[$processGlobals]) {
    (process as any)[$processGlobals] = Object.create(null);
}
const processGlobals: AnyObject = (process as any)[$processGlobals];

export function processGlobal<T extends object = AnyObject>(name: string, init: () => T): T {
    if (!processGlobals[name]) processGlobals[name] = init();
    return processGlobals[name];
}
