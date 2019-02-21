// tslint:disable:no-submodule-imports

import { ConstructorValues, ForEachCallback } from "@usys/collections-ts/common";
import Set = require("@usys/collections-ts/set");
import stringify from "json-stable-stringify";

function equals<T>(a: T, b: T): boolean {
    return stringify(a) === stringify(b);
}

function hash(obj: object): string {
    return stringify(obj);
}

export class ObjectSet<T extends object> {
    readonly store_: Set<T>;

    constructor(values?: ConstructorValues<T>, public defaults?: Partial<T>) {
        this.store_ = new Set(undefined, equals, hash);
        if (values != null) {
            // @ts-ignore
            values.forEach((val) => this.store_.add(this.withDefaults(val)));
        }
    }

    get length(): number {
        return this.store_.length;
    }

    add(value: T): boolean {
        return this.store_.add(this.withDefaults(value));
    }

    has(value: T): boolean {
        return this.store_.has(this.withDefaults(value));
    }

    clear(): void {
        this.store_.clear();
    }

    delete(value: T): boolean {
        return this.store_.delete(this.withDefaults(value));
    }

    forEach<Thisp = undefined>(
        callback: ForEachCallback<T, T, ObjectSet<T>, Thisp>,
        thisp?: Thisp
        ): void {
        this.store_.forEach((value, key) => {
            callback.call(thisp, value, key, this);
        });
    }

    withDefaults(value: T): T {
        // @ts-ignore
        return this.defaults ? { ...this.defaults, ...value } : value;
    }

    [Symbol.iterator](): IterableIterator<T> {
        return this.store_.iterator();
    }
}
