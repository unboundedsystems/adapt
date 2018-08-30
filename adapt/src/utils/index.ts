export * from "./trace";

/**
 * Create a new, empty object and copy only the selected properties from a
 * source object onto the new object.
 * @param srcObj The source object from which to copy properties.
 * @param propList An array of names of properties to copy.
 * @returns The newly created object that contains only the selected properties
 */
export function filterProperties<T extends object, K extends keyof T>(
    srcObj: T, propList: K[]
): Pick<T, K> {
    const destObj = Object.create(null);

    for (const prop of propList) {
        if (srcObj[prop] !== undefined) destObj[prop] = srcObj[prop];
    }
    return destObj;
}
