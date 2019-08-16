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

import { last } from "lodash";
import * as dom from "../dom"; // types only
import { AdaptMountedElement, BuildHelpers } from "../jsx";

export interface BuildContext {
    element: AdaptMountedElement;
    options: dom.BuildOptionsInternal;
    helpers: BuildHelpers;
}

export type StateInfo = Map<AdaptMountedElement, number>;

// Stuff that gets re-created for each new build
export interface HookInfo {
    stateInfo: StateInfo;
}

export function createHookInfo(): HookInfo {
    return {
        stateInfo: new Map<AdaptMountedElement, number>(),
    };
}

const buildContext: BuildContext[] = [];

export function startHooks(context: BuildContext) {
    buildContext.push(context);
}

export function finishHooks() {
    buildContext.pop();
}

export function currentContext() {
    const ctx = last(buildContext);
    if (ctx == null) throw new Error(`Hook functions can only be called from an SFC`);
    return ctx;
}
