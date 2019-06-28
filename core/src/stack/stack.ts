import { isString } from "util";
import { AdaptElementOrNull } from "..";
import { getAdaptContext } from "../ts";

export interface Stack {
    root: AdaptElementOrNull | Promise<AdaptElementOrNull>;
    style: AdaptElementOrNull | Promise<AdaptElementOrNull>;
}

export type Stacks = Map<string, Stack>;

export function stack(
    stackName: string,
    root: AdaptElementOrNull | Promise<AdaptElementOrNull>,
    style: AdaptElementOrNull | Promise<AdaptElementOrNull> = null): void {
    const stacks = getAdaptContext().adaptStacks;
    if (isNullStack(stackName)) throw new Error(`Invalid stack name "${stackName}"`);
    stacks.set(stackName, { root, style });
}

export function nullStack(): Stack {
    return { root: null, style: null };
}

export function isNullStack(s: string | Stack) {
    if (isString(s)) return s === "(null)";
    return s.root === null && s.style === null;
}
