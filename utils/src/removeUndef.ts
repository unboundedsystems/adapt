export function removeUndef<T extends object>(obj: T): T {
    for (const k of Object.keys(obj) as (keyof T)[]) {
        if (obj[k] === undefined) delete obj[k];
    }
    return obj;
}
