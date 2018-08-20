import * as util from "util";

import * as ld from "lodash";

import { AdaptElement, AnyProps, AnyState, Component, isElementImpl, isMountedElement } from "./jsx";
import { StateNamespace } from "./state";

export interface StateStore {
    setElementState(elem: StateNamespace, data: AnyState | undefined): void;
    elementState(elem: StateNamespace): AnyState | undefined;
    serialize(): string;
}

function namespaceToKey(ns: StateNamespace): string {
    return JSON.stringify(ns);
}

function keyToNamespace(key: string): StateNamespace {
    try {
        return JSON.parse(key);
    } catch (e) {
        if (ld.isError(e)) {
            throw new Error("Illegal key: " + e.message);
        } else {
            throw new Error("Illegal key");
        }
    }
}

export function createStateStore(json?: string): StateStore {
    const ret = new StateStoreImpl();
    if (json != null) {
        const init = JSON.parse(json);
        for (const key in init) {
            if (!init.hasOwnProperty(key)) continue;

            const ns = keyToNamespace(key);
            const val = init[key];
            if (ld.isObject(val)) {
                ret.setElementState(ns, val);
            } else if (init[key] === undefined) {
                //Do nothing
            } else {
                throw new Error(`Illegal state in store json: ${key} => ${util.inspect(init[key])}`);
            }
        }
    }
    return ret;
}

export type StateNamespace = string[];

class StateStoreImpl implements StateStore {
    states = new Map<string, AnyState>();

    setElementState(elem: StateNamespace, data: AnyState | undefined) {
        const key = namespaceToKey(elem);
        if (data === undefined) {
            this.states.delete(key);
        } else {
            this.states.set(key, data);
        }
    }

    elementState(elem: StateNamespace): AnyState | undefined {
        return this.states.get(namespaceToKey(elem));
    }

    serialize(): string {
        const ret: AnyState = {};
        this.states.forEach((elem, key) => {
            ret[key] = elem;
        });
        return JSON.stringify(ret);
    }
}

export type StateUpdater<P = AnyProps, S = AnyState> =
    (prev: S | undefined, props: P) => Partial<S>;

interface WritableState<S> {
    state: S;
}

function writableState<P extends object, S extends object>(c: Component<P, S>): WritableState<S> {
    return c as WritableState<S>;
}

function isStateUpdater<P, S>(x: AnyState | StateUpdater<P, S>):
    x is StateUpdater<P, S> {
    return ld.isFunction(x);
}

export function computeStateUpdate<P extends object = AnyProps,
    S extends object = AnyState>(
        prev: S,
        props: P,
        update: Partial<S> | StateUpdater<P, S>): Partial<S> {

    return isStateUpdater(update) ?
        update(prev, props) :
        update;
}

export function applyStateUpdate<
    P extends object = AnyProps,
    S extends object = AnyState>(
        path: StateNamespace,
        component: Component<P, S>,
        store: StateStore,
        update: Partial<S>) {

    let prev: S | {} | undefined = store.elementState(path) as S;
    if (prev === undefined) {
        prev = ("state" in component) ? component.state : {};
    }

    // https://github.com/Microsoft/TypeScript/pull/13288
    const newState: Partial<S> = ld.pickBy(
        // tslint:disable-next-line:no-object-literal-type-assertion
        { ...(prev as any), ...(update as any) } as S,
        (val) => val !== undefined);

    store.setElementState(path, newState);
    writableState(component).state = newState as S; //FIXME(manishv) validate type of newState
}

export function stateNamespaceForPath(path: AdaptElement[]): StateNamespace {
    const elem = ld.last(path);
    if (!elem) return [];
    if (!isElementImpl(elem)) throw new Error("Elements must inherit from ElementImpl");
    if (isMountedElement(elem)) {
        return elem.stateNamespace;
    } else {
        throw new Error("Cannot compute state namespace for path with unmounted elements" + util.inspect(path));
    }
}
