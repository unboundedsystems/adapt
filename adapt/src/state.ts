import * as util from "util";

import * as ld from "lodash";

import { AnyProps, AnyState, Component, isElementImpl, UnbsElement } from "./jsx";
import { StateNamespace } from "./state";

export interface StateStore {
    setElementState(elem: StateNamespace, data: AnyState): void;
    elementState(elem: StateNamespace): AnyState | undefined;
}

export function createStateStore(): StateStore {
    return new StateImpl();
}

export type StateNamespace = string[];

class StateImpl implements StateStore {
    states = new Map<string, AnyState>();

    setElementState(elem: StateNamespace, data: AnyState) {
        this.states.set(JSON.stringify(elem), data);
    }

    elementState(elem: StateNamespace): AnyState | undefined {
        return this.states.get(JSON.stringify(elem));
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
    const newState: Partial<S> = ld.pickBy<S>(
        { ...(prev as any), ...(update as any) },
        (val) => val !== undefined);

    store.setElementState(path, newState);
    writableState(component).state = newState as S; //FIXME(manishv) validate type of newState
}

export function stateNamespaceForPath(path: UnbsElement[]): StateNamespace {
    const elem = ld.last(path);
    if (!elem) return [];
    if (!isElementImpl(elem)) throw new Error("Elements must inherit from ElementImpl");
    if (elem.mounted) {
        return elem.stateNamespace;
    } else {
        throw new Error("Cannot compute state namespace for path with unmounted elements" + util.inspect(path));
    }
}
