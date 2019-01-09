import { last } from "lodash";
import * as dom from "../dom"; // types only
import { AdaptElement } from "../jsx";

export interface BuildContext {
    element: AdaptElement;
    options: dom.BuildOptionsReq;
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
