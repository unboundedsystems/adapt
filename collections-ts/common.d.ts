export type ReduceCallback<T, K, Collection, Thisp, Accum = any> =
    (this: Thisp, result: Accum, value: T, key: K, self: Collection) => Accum;

export type ForEachCallback<T, K, Collection, Thisp = undefined> =
    (this: Thisp, value: T, key: K, self: Collection) => void;

export interface HasForEach<T, K, Collection, Thisp = undefined> {
    forEach(callback: ForEachCallback<T, K, Collection, Thisp>, thisp?: Thisp): void;
}

export type Equals<T> = (left: T, right: T) => boolean;
export type Hash = (obj: any) => string;
export type GetDefault<T> = (val: T) => T;

export type ConstructorValues<T> = ReadonlyArray<T> | HasForEach<T, any, any, any>;
