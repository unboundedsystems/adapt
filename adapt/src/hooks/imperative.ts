import { InternalError } from "../error";
import { GenericInstance, isElementImpl } from "../jsx";
import { currentContext } from "./hooks";

export function useImperativeMethods(create: () => GenericInstance) {
    const ctx = currentContext();

    if (!isElementImpl(ctx.element)) throw new InternalError(`Build context element is not ElementImpl`);
    Object.assign(ctx.element.instanceMethods, create());
}
