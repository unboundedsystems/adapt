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
    stacks.set(stackName, { root, style });
}
