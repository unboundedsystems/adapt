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

import { isObject as ldIsObject } from "lodash";
import { AnyObject } from "./common_types";

/**
 * Returns true if `val` is an Object.
 * @remarks
 * Wraps `lodash.isObject` to provide more useful type assertion return type
 * for many use cases. An example is performing runtime type checking
 * for type assertion functions where the caller wants to narrow
 * the type step by step, typically testing the object's properties as the
 * next step.
 *
 * The lodash version returns `val is object`, which has no index type and
 * no properties, which is more correct in some situations, but less useful
 * for the above use case.
 */
export function isObject(val: any): val is AnyObject {
    return ldIsObject(val);
}
