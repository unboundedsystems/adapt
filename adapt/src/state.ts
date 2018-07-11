import * as ld from "lodash";

import { AnyProps, AnyState, Component } from "./jsx";

export interface StateStore {
    setElementState(elem: BuildPath, data: any): void;
    elementState(elem: BuildPath): AnyState | null;
}

export function create(): StateStore {
    return new StateImpl();
}

export type BuildPath = string[];

class StateImpl implements StateStore {
    states = new Map<string, AnyState>();

    setElementState(elem: BuildPath, data: any) {
        this.states.set(JSON.stringify(elem), data);
    }

    elementState(elem: BuildPath): AnyState | null {
        const ret = this.states.get(JSON.stringify(elem));
        if (ret == undefined) return null;
        return ret;
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
        path: BuildPath,
        component: Component<P, S>,
        store: StateStore,
        update: Partial<S>) {

    let prev: S | {} | null = store.elementState(path) as S;
    if (prev == null) {
        prev = ("state" in component) ? component.state : {};
    }

    // https://github.com/Microsoft/TypeScript/pull/13288
    const newState = { ...(prev as any), ...(update as any) };
    store.setElementState(path, newState);
    writableState(component).state = newState;
}
