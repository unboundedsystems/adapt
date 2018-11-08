import {
    ConstructorValues,
    Equals,
    GetDefault,
    Hash,
    ReduceCallback,
    ForEachCallback,
} from "./common";

declare class Set<T> {
    constructor(
        values?: ConstructorValues<T>,
        equals?: Equals<T>,
        hash?: Hash,
        getDefault?: GetDefault<T>);
    readonly length: number;

    constructClone(values?: ConstructorValues<T>): this;

    add(value: T): boolean;
    addEach(values: ConstructorValues<T>): this;
    clear(): void;
    delete(value: T): boolean;
    remove(value: T): boolean;

    max(): T | undefined;
    min(): T | undefined;
    one(): T | undefined;
    only(): T | undefined;

    get(value: T): T | undefined;
    has(value: T): boolean;
    contains(value: T): boolean;
    indexOf(value: T): number;

    pop(): T | undefined;
    shift(): T | undefined;

    iterator(): IterableIterator<T>;

    forEach<Thisp = undefined>(
        callback: ForEachCallback<T, T, this, Thisp>,
        thisp?: Thisp
        ): void;

    reduceRight<Accum = any, Thisp = undefined>(
        callback: ReduceCallback<T, T, this, Thisp, Accum>,
        basis?: Accum,
        thisp?: Thisp
        ): Accum;
    reduce<Accum = any, Thisp = undefined>(
        callback: ReduceCallback<T, T, this, Thisp, Accum>,
        basis?: Accum,
        thisp?: Thisp
        ): Accum;
}

export = Set;
