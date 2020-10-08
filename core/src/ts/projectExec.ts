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

import * as path from "path";

import { PluginModule } from "../deploy";
import { InternalError } from "../error";
import { ObserverManagerDeployment } from "../observers";
import { nullStack, Stack, Stacks } from "../stack";
import { exec } from "./exec";
import { MemFileHost } from "./hosts";

// Import for type only
import * as Adapt from "../exports";

export interface AdaptContext {
    pluginModules: Map<string, PluginModule>;
    adaptStacks: Stacks;
    observers: Map<string, ObserverManagerDeployment>;
    Adapt: typeof Adapt;
    projectRoot: string;
}

export function createAdaptContext(projectRoot: string): AdaptContext {
    const adaptStacks = new Map<string, Stack>();
    adaptStacks.set("(null)", nullStack());
    return Object.assign(Object.create(null), {
        pluginModules: new Map<string, PluginModule>(),
        adaptStacks,
        observers: new Map<string, ObserverManagerDeployment>(),
        projectRoot,
    });
}

export function getAdaptContext(): AdaptContext {
    const g: any = global;
    if (typeof g.getAdaptContext !== "function") {
        // If we're running inside a VmContext, this should exist on global.
        // It is invalid to call this function from outside a VmContext.
        throw new InternalError(`Unable to get global AdaptContext`);
    }
    return g.getAdaptContext();
}

export function projectExec(projectRoot: string, rootFileName: string) {
    // This becomes "global" inside the project program
    const context = Object.create(null);

    const adaptContext = createAdaptContext(projectRoot);
    context.getAdaptContext = () => adaptContext;

    const fileExt = path.extname(rootFileName);
    const importName = path.basename(rootFileName, fileExt);

    const wrapper = `
        require("source-map-support").install();
        import * as Adapt from "@adpt/core";
        import { getAdaptContext } from "@adpt/core/dist/src/ts";

        getAdaptContext().Adapt = Adapt;

        require("./${importName}");
        `;
    const wrapperFileName = path.join(projectRoot, "[wrapper].ts");
    const host = MemFileHost("/", projectRoot);

    host.writeFile(wrapperFileName, wrapper);

    exec([wrapperFileName, rootFileName], { context, host });

    return adaptContext;
}

// Testing only
export interface MockAdaptContext extends AdaptContext {
    stop: () => void;
}

// Testing only
export function mockAdaptContext(): MockAdaptContext {
    const ctx = createAdaptContext(path.resolve("."));
    const g: any = global;
    const oldContext = g.getAdaptContext;
    g.getAdaptContext = () => ctx;
    return {
        ...ctx,
        stop: () => {
            if (!oldContext) delete g.getAdaptContext;
            else g.getAdaptContext = oldContext;
        },
    };
}
