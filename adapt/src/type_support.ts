import { ExtractType } from "@usys/utils";

export function isClassWithoutNewError(e: Error, name = "\S+"): e is TypeError {
    const noInvokeExp = new RegExp(
        `^Class constructor ${name} cannot be invoked without 'new'`);
    return (e instanceof TypeError && noInvokeExp.test(e.message));
}

export interface Children<C> {
    children: C | C[];
}

export type ChildType<T> =
    T extends Children<any> ? ExtractType<T, keyof Children<any>> : null;
