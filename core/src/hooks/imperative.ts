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

import { InternalError } from "../error";
import { GenericInstance, isElementImpl } from "../jsx";
import { currentContext } from "./hooks";

export interface AnyMethods {
    [ name: string ]: (...args: any[]) => any;
}

export function useImperativeMethods<T extends object = AnyMethods>(create: () => T & GenericInstance) {
    const ctx = currentContext();

    if (!isElementImpl(ctx.element)) throw new InternalError(`Build context element is not ElementImpl`);
    Object.assign(ctx.element.instanceMethods, create());
}
