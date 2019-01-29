export function isClassWithoutNewError(e: Error, name = "\S+"): e is TypeError {
    const noInvokeExp = new RegExp(
        `^Class constructor ${name} cannot be invoked without 'new'`);
    return (e instanceof TypeError && noInvokeExp.test(e.message));
}

export interface Children<C> {
    children?: C | (C | C[])[];
}

export type ChildType<T> =
    T extends { [Name in keyof Required<Children<any>>]: infer Ret } ? Ret :
    T extends { [Name in keyof Required<Children<any>>]?: infer Ret } ? Ret : null;
