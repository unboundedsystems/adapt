export type ExcludeKeys<T, ToRemove> =
    { [K in Exclude<keyof T, ToRemove>]: T[K] };

export type ExcludeInterface<T, ToRemove> =
    ExcludeKeys<T, keyof ToRemove>;

export type FuncType<Args, Ret> = (...args: Args[]) => Ret;
export type ClassType<Args, Ret> = new (...args: Args[]) => Ret;

export type ExtractType<T, Key extends keyof T> = 
    T extends { [Name in Key]: infer Ret } ? Ret : never;

export function isClassWithoutNewError(e: Error, name = '\S+'): e is TypeError {
    const noInvokeExp = new RegExp(
        `^Class constructor ${name} cannot be invoked without 'new'`)
    return (e instanceof TypeError && noInvokeExp.test(e.message));
}

export function asConsOrFunc<Args, Ret>(
    f: FuncType<Args, Ret> | ClassType<Args, Ret>
): FuncType<Args, Ret> {

    return (...args: Args[]) => {
        const fclass = f as (new (...args: Args[]) => Ret);
        const ffunc = f as ((...args: Args[]) => Ret);
        try {
            return ffunc(...args);
        } catch (e) {
            if (isClassWithoutNewError(e, f.name)) {
                return new fclass(...args);
            }
            throw e;
        }
    }

}