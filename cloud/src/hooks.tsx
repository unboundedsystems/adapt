import {
    AdaptElement,
    ElementPredicate,
    Handle,
    isApplyStyle,
    isMountedElement,
    serializeDom,
    useImperativeMethods,
    useState,
} from "@adpt/core";
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

/**
 *  @beta
 *  Immediately call method on instance pointed to by handle
 */
export function callInstanceMethod<T = any>(hand: Handle, def: T, methodName: string, ...args: any[]): T {
    const method = getInstanceValue<(...args: any[]) => T>(hand, () => def, methodName);
    const mountedOrig = hand.associated ? hand.mountedOrig : null;
    if (!ld.isFunction(method)) {
        throw new Error(`${methodName} exists but is not a function on handle instance:\n` +
            ((mountedOrig != null) ? serializeDom(mountedOrig) : `mountedOrig is ${mountedOrig}`));
    }
    return method(...args);
}

/**
 * Immediately call a method on the successor instance of the one pointed to by handle.
 *
 *  @remarks
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
 *
 * @beta
 */
export function callNextInstanceMethod<T = any>(hand: Handle, def: T, methodName: string, ...args: any[]): T {
    if (!hand.associated) {
        // tslint:disable-next-line: max-line-length
        throw new Error(`Cannot find next instance when calling ${methodName}: handle is not associated with any element`);
    }
    // Skip hand.mountedOrig and start with its successor
    const method = getInstanceValue<(...args: any[]) => T>(hand, () => def,
        methodName, { pred: hasInstanceMethod(methodName, hand.mountedOrig) });
    const mountedOrig = hand.mountedOrig;
    if (!ld.isFunction(method)) {
        throw new Error(`${methodName} exists but is not a function on handle instance:\n` +
            ((mountedOrig != null) ? serializeDom(mountedOrig) : `mountedOrig is ${mountedOrig}`));
    }
    return method(...args);
}

export const defaultGetInstanceValueOptions: GetInstanceValueOptions = {
    pred: notReplacedByStyle(),
    throwOnNoElem: false
};

export interface GetInstanceValueOptions {
    pred?: ElementPredicate;
    throwOnNoElem?: boolean;
}

/**
 * Get the value of a field on an element instance
 *
 * @beta
 */
export function getInstanceValue<T = any>(hand: Handle, def: T, field: string, optionsIn?: GetInstanceValueOptions): T {
    const options = { ...defaultGetInstanceValueOptions, ...optionsIn };
    const pred = options.pred;
    if (!hand.associated) {
        if (!options.throwOnNoElem) return def;
        throw new Error(`Cannot get instance field ${field}: Handle is not associated with element`);
    }
    const elem = hand.nextMounted(pred);
    if (!elem) {
        if (!options.throwOnNoElem) return def;
        throw new Error(`Cannot get instance field ${field}: Handle does not point to mounted element`);
    }
    if (!elem.instance) {
        throw new Error(`Internal Error: Element is mounted but instance is ${elem.instance}`);
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

/**
 * Get the value of field from the instance referenced by handled instance.
 *
 * @remarks
 * On first invocation, or if the handle is no associated with an element, or the field is not found,
 * the value of `initial` will be returned.  After the element referenced by handle has been instantiated,
 * this hook will fetch the actual value of `field`, cause a rebuild, and then return that value
 * on the next call of the hook.
 *
 * @beta
 */
export function useInstanceValue<T>(hand: Handle, initial: T, field: string) {
    return useAsync<T>(async () => getInstanceValue(hand, initial, field), initial);
}

export function useMethod<T>(hand: Handle, initial: T, method: string, ...args: any[]) {
    return useAsync<T>(async () => {
        return callInstanceMethod<T>(hand, initial, method, ...args);
    }, initial);
}

export function useMethodFrom(hand: Handle, methodName: string, defaultVal?: any,
    ...args: any[]) {
    useImperativeMethods(() => ({
        [methodName]: () => callInstanceMethod(hand, defaultVal, methodName, ...args)
    }));
}
