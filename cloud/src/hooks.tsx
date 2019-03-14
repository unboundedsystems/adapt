import {
    AdaptElement,
    ElementPredicate,
    Handle,
    isApplyStyle,
    isMountedElement,
    serializeDom,
    useState,
} from "@usys/adapt";
import ld from "lodash";

export function useAsync<T>(f: () => Promise<T> | T, initial: T): T {
    const [val, setVal] = useState(initial);
    setVal(f);
    return val;
}

export function hasInstanceMethod(name: string, skip?: AdaptElement | null): ElementPredicate {
    return (el) => {
        if (el === skip) return false;
        if (!isMountedElement(el)) throw new Error(`Element is not an ElementImpl`);
        const inst = el.instance;
        return ld.isFunction(inst[name]);
    };
}

export function notReplacedByStyle(): ElementPredicate {
    return (el) => {
        if (!isMountedElement(el)) throw new Error(`Element is not an ElementImpl`);
        const succ = el.buildData.successor;
        if (succ == null) return true;
        if (!isApplyStyle(succ)) return true;
        return false;
    };
}

export function callInstanceMethod<T = any>(hand: Handle, def: T, methodName: string, ...args: any[]): T {
    const method = getInstanceValue<(...args: any[]) => T>(hand, () => def,
        methodName, notReplacedByStyle());
    const mountedOrig = hand.mountedOrig;
    if (!ld.isFunction(method)) {
        throw new Error(`${methodName} exists but is not a function on handle instance:\n` +
            ((mountedOrig != null) ? serializeDom(mountedOrig) : `mountedOrig is ${mountedOrig}`));
    }
    return method(...args);
}

/*
 * NOTE(mark): There are a couple differences between callNextInstanceMethod
 * and callInstanceMethod, all based on which predicate they pass to
 * getInstanceValue, either hasInstanceMethod or notReplacedByStyle.
 * - callInstance may use the instance from hand.mountedOrig where
 *   callNextInstance specifically skips it.
 * - callInstance may choose an instance that does not have the requested
 *   method, even though there may be an instance that has it in the chain.
 * - callInstance looks at buildData.successor to determine which elem
 *   to choose, but callNextInstance just relies on hand.nextMounted.
 *   I think ultimately buildData.successor can be replaced by just using
 *   hand.nextMounted everywhere.
 * - callInstance looks at whether a successor is an ApplyStyle,
 *   callNextInstance does not.
 * I think that we can probably move everything to use the hasInstanceMethod
 * predicate, with the only option being whether to skip hand.mountedOrig.
 */
export function callNextInstanceMethod<T = any>(hand: Handle, def: T, methodName: string, ...args: any[]): T {
    // Skip hand.mountedOrig and start with its successor
    const method = getInstanceValue<(...args: any[]) => T>(hand, () => def,
        methodName, hasInstanceMethod(methodName, hand.mountedOrig));
    const mountedOrig = hand.mountedOrig;
    if (!ld.isFunction(method)) {
        throw new Error(`${methodName} exists but is not a function on handle instance:\n` +
            ((mountedOrig != null) ? serializeDom(mountedOrig) : `mountedOrig is ${mountedOrig}`));
    }
    return method(...args);
}

export function getInstanceValue<T = any>(hand: Handle, def: T | undefined, field: string, pred?: ElementPredicate): T {
    const elem = hand.nextMounted(pred);
    if (!elem) {
        if (def !== undefined) return def;
        throw new Error(`Cannot get instance field ${field}: Handle does not point to mounted element`);
    }
    if (!elem.instance) {
        throw new Error(`Element is mounted but instance is ${elem.instance}`);
    }
    if (!(field in elem.instance)) {
        throw new Error(`${field} does not exist on handle instance:\n` + serializeDom(elem));
    }
    const val = elem.instance[field];
    if (ld.isFunction(val)) {
        return val.bind(elem.instance);
    }
    return val;
}

export function useMethod<T>(hand: Handle, initial: T, method: string, ...args: any[]) {
    return useAsync<T>(async () => {
       return callInstanceMethod<T>(hand, initial, method, ...args);
    }, initial);
}
