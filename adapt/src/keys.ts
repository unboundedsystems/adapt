import * as util from "util";

import * as ld from "lodash";

import {
    AdaptElement,
    AnyProps,
    AnyState,
    Component,
    isElement,
} from "./jsx";
import { StateNamespace } from "./state";

export function setKey(elem: AdaptElement, key: string) {
    if (Object.isFrozen(elem.props)) {
        const newProps = Object.assign(ld.clone(elem.props), { key });
        Object.freeze(newProps);
        (elem as { props: AnyProps }).props = newProps;
    } else {
        elem.props.key = key;
    }
}

export function computeMountKey(elem: AdaptElement, parentStateNamespace: StateNamespace): string {
    let newKey: string | undefined = elem.props.key;
    if (newKey == null) {
        const lastKey = ld.last(parentStateNamespace);
        const name = (elem.componentType.name === "") ? "anonymous" : elem.componentType.name;
        newKey = (lastKey == null) ? name : `${lastKey}-${name}`;
    }
    return newKey;
}

export function assignKeysAtPlacement(siblingsIn: any | any[] | null | undefined) {
    const existingKeys = new KeyNames();
    const needsKeys: AdaptElement[] = [];
    const duplicateKeys: AdaptElement[] = [];

    if (siblingsIn == null) return;
    const siblings = ld.isArray(siblingsIn) ? siblingsIn : [siblingsIn];

    for (const node of siblings) {
        if (isElement(node)) {
            if (("key" in node.props) && (node.props.key != null)) {
                if (ld.isString(node.props.key)) {
                    if (existingKeys.has(node.props.key)) {
                        duplicateKeys.push(node);
                    } else {
                        existingKeys.add(node.props.key);
                    }
                } else {
                    throw new Error(
                        `children have non-string keys: ${node.componentType.name}: ${util.inspect(node.props.key)}`);
                }
            } else {
                needsKeys.push(node);
            }
        }
    }

    if (duplicateKeys.length !== 0) {
        throw new Error(`children have duplicate keys: ${util.inspect(duplicateKeys)}`);
    }

    for (const elem of needsKeys) {
        const elemName = elem.componentType.name;
        const key = existingKeys.getUnique(elemName);
        setKey(elem, key);
    }
}

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
