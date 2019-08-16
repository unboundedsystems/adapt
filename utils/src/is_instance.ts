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

import { isObject } from "lodash";

const preTag = "isInstance:";

// tslint:disable-next-line: ban-types
export function isInstance(val: any, ctorOrTag: string | Function, scope?: string): boolean {
    if (!val || !isObject(val)) return false;
    const tag = typeof ctorOrTag === "string" ? ctorOrTag : ctorOrTag.name;
    scope = scope ? scope + ":" : "";
    return val[Symbol.for(preTag + scope + tag)] === true;
}

export function tagInstance(val: object, tag?: string, scope?: string) {
    if (tag === undefined) {
        if (!val.constructor.name || val.constructor.name === "anonymous") {
            throw new Error(
                `Anonymous functions unsupported due to inability to ` +
                `distinguish them. Please specify an explicit tag instead.`);
        }
        tag = val.constructor.name;
    }
    scope = scope ? scope + ":" : "";
    (val as any)[Symbol.for(preTag + scope + tag)] = true;
}

// tslint:disable-next-line: ban-types
export function tagConstructor(ctor: Function, scope?: string, tag?: string) {
    if (ctor.prototype == null) {
        throw new Error(
            `tagConstructor cannot be used for function '${ctor.name}' ` +
            `because it does not have a prototype.`);
    }
    tagInstance(ctor.prototype, tag, scope);
}
