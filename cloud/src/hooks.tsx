import { Handle, serializeDom, useState } from "@usys/adapt";
import ld from "lodash";

export function useAsync<T>(f: () => Promise<T> | T, initial: T): T {
    const [val, setVal] = useState(initial);
    setVal(f);
    return val;
}

export function callInstanceMethod<T = any>(hand: Handle, def: T, methodName: string, ...args: any[]): T {
    const method = getInstanceValue<(...args: any[]) => T>(hand, () => def, methodName);
    const mountedOrig = hand.mountedOrig;
    if (!ld.isFunction(method)) {
        throw new Error(`${methodName} exists but is not a function on handle instance:\n`
            + ((mountedOrig != null) ? serializeDom(mountedOrig, false) : `mountedOrig is ${mountedOrig}`));
    }
    return method(...args);
}

export function getInstanceValue<T = any>(hand: Handle, def: T | undefined, field: string): T {
    const mountedOrig = hand.mountedOrig;
    if (!mountedOrig) {
        if (def !== undefined) return def;
        throw new Error(`Cannot get instance field ${field}: Handle does not point to mounted element`);
    }
    if (!mountedOrig.instance) {
        throw new Error(`Element is mounted but instance is ${mountedOrig.instance}`);
    }
    if (!(field in mountedOrig.instance)) {
        throw new Error(`${field} does not exist on handle instance:\n` + serializeDom(mountedOrig, false));
    }
    const val = mountedOrig.instance[field];
    if (ld.isFunction(val)) {
        return val.bind(mountedOrig.instance);
    }
    return val;
}

export function useMethod<T>(hand: Handle, initial: T, method: string, ...args: any[]) {
    return useAsync<T>(async () => {
       return callInstanceMethod<T>(hand, initial, method, ...args);
    }, initial);
}
