// Generic stuff that should be put in a different library and open sourced
export type ExcludeKeys<T, ToRemove> = { [K in Exclude<keyof T, ToRemove>]: T[K] };

export type ExcludeInterface<T, ToRemove> =
    ExcludeKeys<T, keyof ToRemove>;

export type FuncType<Args, Ret> = (...args: Args[]) => Ret;
export type ClassType<Args, Ret> = new (...args: Args[]) => Ret;

export type ExtractType<T, Key extends keyof T> =
    T extends { [Name in Key]: infer Ret } ? Ret : never;

export function isClassWithoutNewError(e: Error, name = "\S+"): e is TypeError {
    const noInvokeExp = new RegExp(
        `^Class constructor ${name} cannot be invoked without 'new'`);
    return (e instanceof TypeError && noInvokeExp.test(e.message));
}

//Stuff specific to this library (Adapt).
export interface Children<C> {
    children: C | C[];
}

export type ChildType<T> =
    T extends Children<any> ? ExtractType<T, keyof Children<any>> : null;

export type Constructor<T extends object> = (new (...args: any[]) => T);
