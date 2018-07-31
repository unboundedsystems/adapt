import { AdaptElementOrNull } from "..";
import { getAdaptContext } from "../ts";

export interface Stack {
    root: AdaptElementOrNull;
    style: AdaptElementOrNull;
}

export interface Stacks {
    [stackName: string]: Stack;
}

export function stack(stackName: string, root: AdaptElementOrNull,
                      style: AdaptElementOrNull = null): void {
    const stacks = getStacks(true);
    stacks[stackName] = { root, style };
}

export function getStacks(create = false): Stacks {
    const aContext = getAdaptContext();
    if (!aContext.adaptStacks && create === true) {
        aContext.adaptStacks = Object.create(null);
    }
    return aContext.adaptStacks;
}
