import { last } from "lodash";
import * as dom from "../dom"; // types only
import { AdaptMountedElement } from "../jsx";

export interface BuildContext {
    element: AdaptMountedElement;
    options: dom.BuildOptionsInternal;
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
