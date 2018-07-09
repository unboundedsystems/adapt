import {
    AnyProps,
    AnyState,
    Component,
} from "./jsx";

/**
 * Stores the set of keys for a given group of sibling elements to keep
 * track of uniqueness and optionally generate a new unique key, given
 * a base name.
 */
class KeyNames {
    names: Map<string, number> = new Map<string, number>();

    getUnique(baseName: string): string {
        let unique = baseName;
        let next = this.names.get(baseName);
        if (next === undefined) {
            next = 1;
        } else {
            unique += next.toString();
            next++;
        }
        this.names.set(baseName, next);
        return unique;
    }

    has(key: string): boolean {
        return this.names.has(key);
    }

    add(key: string) {
        if (this.names.has(key)) {
            throw new Error(`Cannot add duplicate key '${key}`);
        }
    }
}

export class KeyTracker {
    private path: string[] = [];
    private names: KeyNames[] = [];
    private depth = 0;

    constructor() {
        this.names.push(new KeyNames());
    }

    lastKeyPath(): string {
        return this.path.join(".");
    }

    addKey(component: Component<AnyProps, AnyState>) {
        // TODO: Allow components to make names for themselves
        const compName = component.constructor.name;
        const uniqueName = this.names[this.depth].getUnique(compName);
        this.path[this.depth] = uniqueName;
    }

    pathPush() {
        this.names.push(new KeyNames());
        this.depth++;
    }

    pathPop() {
        if (this.depth <= 0) {
            throw new Error(`Attempt to pop KeyTracker past 0`);
        }
        this.depth--;
        this.path.pop();
        this.names.pop();
    }
}

/**
 * Public API object that gets passed to PrimitiveComponent.updateState
 */
export class UpdateStateInfo {
    private _nodeName: () => string;

    constructor(keyTracker: KeyTracker) {
        this._nodeName = keyTracker.lastKeyPath.bind(keyTracker);
    }

    get nodeName(): string {
        return this._nodeName();
    }
}
