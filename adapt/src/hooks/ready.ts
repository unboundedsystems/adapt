import { Handle } from "../handle";
import { BuildHelpers, isReady } from "../jsx";
import { useImperativeMethods } from "./imperative";

export function useReadyFrom(targetHand: Handle) {
    useImperativeMethods(() => ({
        ready: (helpers: BuildHelpers) => isReady(helpers, targetHand)
    }));
}
