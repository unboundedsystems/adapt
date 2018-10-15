import { AdaptElement, isMountedElement } from "./jsx";

export interface Handle {
    readonly target: AdaptElement | null;
    readonly name?: string;
}

export function isHandle(val: unknown): val is Handle {
    return val instanceof HandleImpl;
}

export interface HandleInternal extends Handle {
    replaced: boolean;

    associate(el: AdaptElement): void;
    replace(child: AdaptElement | null): void;
}

export function isHandleInternal(val: unknown): val is HandleInternal {
    return val instanceof HandleImpl;
}

export function getInternalHandle(el: AdaptElement): HandleInternal {
    const hand = el.props.handle;
    if (!isHandleInternal(hand)) throw new Error(`Internal error: handle is not a HandleImpl`);
    return hand;
}

let nextId = 0;

const id = Symbol.for("AdaptHandleId");
const origElement = Symbol.for("AdaptHandleOrigElement");

class HandleImpl implements HandleInternal {
    readonly name?: string;
    [origElement]?: AdaptElement;
    [id]: number; // For debugging

    // childElement is:
    //   a) undefined before origElement is associated & built
    //   b) an Element if origElement's build replaced with another Element
    //   c) null if there's no longer an Element in the final DOM that
    //      corresponds to this handle.
    childElement?: AdaptElement | null;

    constructor(name?: string) {
        if (name) this.name = name;
        this[id] = nextId++;
    }

    associate = (el: AdaptElement) => {
        const orig = this[origElement];
        if (orig != null) {
            const path = isMountedElement(orig) ? orig.path : "<not mounted>";
            throw new Error(
                `Cannot associate a Handle with more than one AdaptElement. ` +
                `Original element type ${orig.componentType.name}, ` +
                `path: ${path}, ` +
                `second association element type ${el.componentType.name}`);
        }
        this[origElement] = el;
    }

    replace = (el: AdaptElement | null) => {
        if (this.replaced) {
            throw new Error(`Cannot call replace on a Handle more than once`);
        }
        // Replacing with origElement doesn't modify anything (and importantly,
        // doesn't create a loop for target).
        if (el === this[origElement]) return;

        this.childElement = el;
    }

    get replaced(): boolean {
        return this.childElement !== undefined;
    }

    get id() {
        return this[id];
    }

    get target(): AdaptElement | null {
        // tslint:disable-next-line:no-this-assignment
        let hand: HandleImpl = this;
        while (true) {
            const orig = hand[origElement];
            if (orig == null) {
                throw new Error(`This handle was never associated with an AdaptElement`);
            }
            if (hand.childElement === undefined) return orig;

            // Null child means no Element is present for this handle in
            // the final DOM.
            if (hand.childElement === null) return null;

            const childHand = hand.childElement.props.handle;
            if (childHand == null) {
                throw new Error(`Internal error: no Handle present on Element in child chain`);
            }
            if (!(childHand instanceof HandleImpl)) {
                throw new Error(`Internal error: Handle present on Element is not a HandleImpl`);
            }

            hand = childHand;
        }
    }

    toString() {
        return `Handle(${this.id})`;
    }

    toJSON() {
        const el = this.target;
        const target = isMountedElement(el) ? el.path : null;

        return {
            name: this.name,
            target,
        };
    }
}

/**
 * User-facing API for creating a Handle
 * @param name Name to associate with the handle for debugging/display purposes
 */
export function handle(name?: string): Handle {
    return new HandleImpl(name);
}
