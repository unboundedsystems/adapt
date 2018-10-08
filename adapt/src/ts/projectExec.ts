import * as path from "path";

import { ObserverManagerDeployment } from "../observers";
import { PluginModule } from "../plugin_support";
import { Stack, Stacks } from "../stack";
import { exec } from "./exec";
import { MemFileHost } from "./hosts";

// Import for type only
import * as Adapt from "..";

export interface AdaptContext {
    pluginModules: Map<string, PluginModule>;
    adaptStacks: Stacks;
    observers: Map<string, ObserverManagerDeployment>;
    Adapt: typeof Adapt;
    destroy: () => void;
}

function createAdaptContext(): AdaptContext {
    return Object.assign(Object.create(null), {
        pluginModules: new Map<string, PluginModule>(),
        adaptStacks: new Map<string, Stack>(),
        observers: new Map<string, ObserverManagerDeployment>(),
        destroy: () => {/**/},
    });
}

export function getAdaptContext(): AdaptContext {
    const g: any = global;
    if (typeof g.getAdaptContext !== "function") {
        // If we're running inside a VmContext, this should exist on global.
        // It is invalid to call this function from outside a VmContext.
        throw new Error(`Internal error: Unable to get global AdaptContext`);
    }
    return g.getAdaptContext();
}

export function projectExec(projectRoot: string, rootFileName: string) {
    // This becomes "global" inside the project program
    const context = Object.create(null);

    const adaptContext = createAdaptContext();
    context.getAdaptContext = () => adaptContext;

    const fileExt = path.extname(rootFileName);
    const importName = path.basename(rootFileName, fileExt);

    const wrapper = `
        require("source-map-support").install();
        import * as Adapt from "@usys/adapt";
        import { getAdaptContext } from "@usys/adapt/dist/src/ts";

        getAdaptContext().Adapt = Adapt;

        require("./${importName}");
        `;
    const wrapperFileName = path.join(projectRoot, "[wrapper].ts");
    const host = MemFileHost("/", projectRoot);

    host.writeFile(wrapperFileName, wrapper, false);

    const ret = exec([wrapperFileName, rootFileName], { context, host });

    adaptContext.destroy = ret.destroy;
    return adaptContext;
}

// Testing only
export interface MockAdaptContext extends AdaptContext {
    stop: () => void;
}

// Testing only
export function mockAdaptContext(): MockAdaptContext {
    const ctx = createAdaptContext();
    const g: any = global;
    if (g.getAdaptContext != null) throw new Error(`Can't mock AdaptContext. getAdaptContext already set.`);
    g.getAdaptContext = () => ctx;
    return {
        ...ctx,
        stop: () => delete g.getAdaptContext
    };
}
