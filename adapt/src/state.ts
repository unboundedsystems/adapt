import { AnyState } from "./jsx";

export interface State {
    elementState(elem: BuildPath): AnyState | null;
}

export function create(): State {
    return new StateImpl();
}

export type BuildPath = string[];

class StateImpl implements State {
    states = new Map<string, AnyState>();

    elementState(elem: BuildPath): AnyState | null {
        const ret = this.states.get(JSON.stringify(elem));
        if (ret == undefined) return null;
        return ret;
    }
}
