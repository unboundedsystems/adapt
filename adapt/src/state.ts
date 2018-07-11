import { AnyState } from "./jsx";

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
