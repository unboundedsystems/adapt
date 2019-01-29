import { Handle, useState } from "@usys/adapt";

export function useAsync<T>(f: () => Promise<T> | T, initial: T): T {
    const [val, setVal] = useState(initial);
    setVal(f);
    return val;
}

export function useMethod<T>(hand: Handle, initial: T, method: string, ...args: any[]) {
    return useAsync<T>(async () => {
        if (hand.mountedOrig == null) throw new Error("Handle does not point to element");
        const result = hand.mountedOrig.instance[method](...args);
        if (result === undefined) return initial;
        return result;
    }, initial);
}
