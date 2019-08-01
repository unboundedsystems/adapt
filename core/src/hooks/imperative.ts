import { InternalError } from "../error";
import { GenericInstance, isElementImpl } from "../jsx";
import { currentContext } from "./hooks";

export interface AnyMethods {
    [ name: string ]: (...args: any[]) => any;
}

export function useImperativeMethods<T extends object = AnyMethods>(create: () => T & GenericInstance) {
    const ctx = currentContext();

    if (!isElementImpl(ctx.element)) throw new InternalError(`Build context element is not ElementImpl`);
    Object.assign(ctx.element.instanceMethods, create());
}
