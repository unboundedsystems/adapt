import {
    AdaptElement,
    BuildHelpers,
    Handle,
    isHandle,
    useImperativeMethods,
} from "@usys/adapt";

export async function isReady(h: BuildHelpers, e: AdaptElement | Handle): Promise<boolean> {
    const handle = isHandle(e) ? e : e.props.handle;
    const elem = handle.mountedOrig;
    if (elem === undefined) throw new Error("element has no mountedOrig!");
    if (elem === null) return true;

    if (!elem.instance.ready) return true;
    return elem.instance.ready(h);
}

export function useForwardReady(targetHand: Handle) {
    useImperativeMethods(() => ({
        ready: (helpers: BuildHelpers) => isReady(helpers, targetHand)
    }));
}
