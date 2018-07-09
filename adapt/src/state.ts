import * as ld from "lodash";

import { AnyState } from "./jsx";

export interface BuildPath {
    pop(key: string): BuildPath;
    push(key: string): BuildPath;
    serialize(pretty?: boolean): string;
}

export interface State {
    elementState(elem: BuildPath): AnyState | null;
}

export function newBuildPath(topLevel: string): BuildPath {
    return new BuildPathImpl(null, topLevel);
}

export function deserializeBuildPath(json: string): BuildPath {
    const elements = JSON.parse(json);

    if (!ld.isArray(elements)) throw new Error("String is not a BuildPath: Not Array");
    if (elements.length === 0) throw new Error("String is not a BuildPath: empty array");

    let ret: BuildPath | null = null;
    for (const elem of elements) {
        if (!ld.isString(elem)) throw new Error("String is not a BuildPath: Element not a string");
        ret = (ret != null) ?
            ret.push(elem) :
            newBuildPath(elem);
    }

    if (ret == null) throw new Error("Internal Error");
    return ret;
}

export function create(): State {
    return new StateImpl();
}

class BuildPathImpl implements BuildPath {
    constructor(
        readonly parent: BuildPathImpl | null,
        readonly key: string) {

        if (parent == null) {
            this.parent = null;
        }
    }

    pop(key: string) {
        if (this.parent == null) {
            throw new Error("At top of build path, cannot pop");
        }
        return this.parent;
    }

    push(key: string) {
        return new BuildPathImpl(this, key);
    }

    elements(): string[] {
        if (this.parent == null) {
            return [this.key];
        }

        const ret = this.parent.elements();
        ret.push(this.key);
        return ret;
    }

    serialize(pretty = false): string {
        const indent = pretty == null ? undefined : 2;
        return JSON.stringify(this.elements(), undefined, indent);
    }
}

class StateImpl implements State {
    states = new Map<string, AnyState>();

    elementState(elem: BuildPath): AnyState | null {
        const ret = this.states.get(elem.serialize());
        if (ret == undefined) return null;
        return ret;
    }
}
