import { AdaptElementOrNull } from "..";
import { getAdaptContext } from "../ts";

export interface Stack {
    root: AdaptElementOrNull;
    style: AdaptElementOrNull;
}

export type Stacks = Map<string, Stack>;

export function stack(stackName: string, root: AdaptElementOrNull,
                      style: AdaptElementOrNull = null): void {
    const stacks = getAdaptContext().adaptStacks;
    stacks.set(stackName, { root, style });
}
