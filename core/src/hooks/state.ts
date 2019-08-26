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

import { isObject } from "@adpt/utils";
import { isFunction } from "lodash";
import { InternalError } from "../error";
import { AnyState, isElementImpl } from "../jsx";
import { currentContext } from "./hooks";

export type CombinedState = AnyState;
export type StateUpdater<S> = (prev: S) => S | Promise<S>;
export type SetState<S> = (s: S | StateUpdater<S>) => void;
export type UseStateInit<S> = S | (() => S);

export function useState<ItemState>(init: UseStateInit<ItemState>): [ItemState, SetState<ItemState>] {
    const ctx = currentContext();
    const stateInfo = ctx.options.hookInfo.stateInfo;
    const stateStore = ctx.options.stateStore;
    const elem = ctx.element;

    const count = stateInfo.get(ctx.element) || 0;
    stateInfo.set(ctx.element, count + 1);

    if (!isElementImpl(elem)) throw new InternalError(`Build context element is not ElementImpl`);
    const ns = elem.stateNamespace;
    let stateValue = stateStore.elementState(ns);
    if (stateValue === undefined) stateValue = {};
    const key = "" + count;

    if (stateValue[key] === undefined) {
        stateValue[key] = isFunction(init) ? init() : init;
        stateStore.setElementState(ns, stateValue);
    }

    function setState(val: ItemState | Promise<ItemState> | StateUpdater<ItemState>) {
        const updater = async (prev: CombinedState): Promise<CombinedState> => {
            if (prev == null || !isObject(prev)) throw new InternalError(`previous state was not an object`);

            if (isFunction(val)) val = val(prev[key]);
            return { [key]: await val };
        };
        if (!isElementImpl(elem)) throw new InternalError(`Build context element is not ElementImpl`);
        elem.setState(updater);
    }

    return [ stateValue[count], setState ];
}
