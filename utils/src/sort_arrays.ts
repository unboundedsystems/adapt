import stringify from "json-stable-stringify";

export type ArrayKeys<T> = { [K in keyof T]: Required<T>[K] extends any[] ? K : never }[keyof T];

/**
 * Given an object, will sort any properties of that object that are arrays.
 * The sort of each array happens in-place, modifying the original arrays.
 * @param obj An object whose array properties will be sorted
 * @param keys  The specific property names to sort
 */
export function sortArraysInObject<T extends object>(
    obj: T,
    keysIn?: ArrayKeys<T>[],
    ignoreNonArrays: boolean = false): void {

    let keys: string[];
    keys = keysIn ? keysIn.map((v) => v.toString()) : Object.keys(obj);
    if (!keysIn) ignoreNonArrays = true;

    for (const k of keys) {
        const arr = (obj as any)[k];
        if (arr === undefined) continue;
        if (!Array.isArray(arr)) {
            if (ignoreNonArrays) {
                continue;
            } else {
                throw new Error(`Unable to sort non-array (key=${k})`);
            }
        }
        if (arr.length === 0) continue;
        sortArray(arr);
    }
}

export function sortArray<T>(arr: T[]): T[] {
    if (typeof arr[0] === "string") arr.sort();
    else {
        arr.sort((a, b) => {
            const aS = stringify(a);
            const bS = stringify(b);
            return a === b ? 0 :
                aS < bS ? -1 : 1;
        });
    }
    return arr;
}
