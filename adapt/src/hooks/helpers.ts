import { BuildHelpers } from "../jsx";
import { currentContext } from "./hooks";

export function useBuildHelpers(): BuildHelpers {
    const ctx = currentContext();
    return ctx.helpers;
}
