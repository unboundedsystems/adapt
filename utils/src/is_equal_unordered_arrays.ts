import * as ld from "lodash";
import { sortArray } from "./sort_arrays";

const sorted = Symbol();

// LoDash isEqualWith says that a true comparison means equal, false means unequal, and undefined means
// I don't know, do the normal isEqual thing at this level.
function compareArrays(x: unknown, y: unknown): boolean | undefined {
    if (!ld.isArray(x)) return;
    if (!ld.isArray(y)) return;
    if ((x as any)[sorted] && (y as any)[sorted]) return;
    if (x.length !== y.length) return false;
    const xClone = ld.cloneDeep(x);
    const yClone = ld.cloneDeep(y);
    sortArray(xClone); //FIXME(manishv) sortArrays does a json stable stringify which will make this very slow
    sortArray(yClone);
    (xClone as any)[sorted] = true;
    (yClone as any)[sorted] = true;
    return ld.isEqualWith(xClone, yClone, compareArrays);
}

/**
 * Given two values, this will do a deep comparison like lodash isEqual, but
 * will compare array properties as if order does not matter.
 * @param obj first object to be compared
 * @param other object to comapre to.
 */
export function isEqualUnorderedArrays(obj: unknown, other: unknown): boolean {
    return ld.isEqualWith(obj, other, compareArrays);
}
