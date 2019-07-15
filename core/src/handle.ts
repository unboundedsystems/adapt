import { isInstance, sha256hex, tagConstructor } from "@adpt/utils";
import { InternalError } from "./error";
import { AdaptElement, AdaptMountedElement, ElementPredicate, isMountedElement, KeyPath } from "./jsx";
import { findMummyUrn, registerObject } from "./reanimate";

export interface Handle extends Readonly<Partial<BuildId>> {
    readonly associated: boolean;
    readonly target: AdaptElement | null | undefined;
    readonly origTarget: AdaptElement | null | undefined;
    readonly mountedOrig: AdaptMountedElement | null | undefined;
    readonly name?: string;
    nextMounted(pred?: ElementPredicate): AdaptMountedElement | null | undefined;
    replaceTarget(child: AdaptElement | null, buildId: BuildId): void;
}

export function isHandle(val: unknown): val is Handle {
    return isHandleImpl(val);
}

export interface HandleInternal extends Handle {
    unresolvedTarget?: KeyPath | null;

    associate(el: AdaptElement): void;
    targetReplaced(buildId: BuildId): boolean;
}

export interface BuildId {
    buildNum: number;
}

export function isHandleInternal(val: unknown): val is HandleInternal {
    return isHandleImpl(val);
}

export function getInternalHandle(el: AdaptElement): HandleInternal {
    const hand = el.props.handle;
    if (!isHandleInternal(hand)) throw new InternalError(`handle is not a HandleImpl`);
    return hand;
}

let nextId = 0;

const id = Symbol.for("AdaptHandleId");
const origElement = Symbol.for("AdaptHandleOrigElement");

interface HandleOptions {
    name?: string;
    target?: KeyPath;
}

export const handleSignature = sha256hex("This is an Adapt.Handle");
export interface HandleObj {
    __adaptIsHandle: string;
    name?: string;
    target: string[] | null;
    urn: string;
}

export function isHandleObj(val: object): val is HandleObj {
    return (val as any).__adaptIsHandle === handleSignature;
}

function traverseUntil(hand: HandleImpl, pred: (hand: HandleImpl) => boolean) {
    while (!pred(hand)) {
        const orig = hand.origTarget;
        if (orig === undefined) {
            throw new InternalError(`Handle chain has undefined origTarget`);
        }
        if (hand.childElement === undefined) break;

        // Null child means no Element is present for this handle in
        // the final DOM.
        if (hand.childElement === null) return null;

        const childHand = hand.childElement.props.handle;
        if (childHand == null) {
            throw new InternalError(`no Handle present on Element in child chain`);
        }
        if (!isHandleImpl(childHand)) {
            throw new InternalError(`Handle present on Element is not a HandleImpl`);
        }

        hand = childHand;
    }

    return hand.origTarget;
}

class HandleImpl implements HandleInternal {
    readonly name?: string;
    unresolvedTarget?: KeyPath | null;
    [origElement]?: AdaptElement | null;
    [id]: number; // For debugging
    buildNum?: number;

    // childElement is:
    //   a) undefined before origElement is associated & built
    //   b) undefined if handle was reanimated
    //   c) an Element if origElement's build replaced with another Element
    //   d) null if there's no longer an Element in the final DOM that
    //      corresponds to this handle.
    childElement?: AdaptElement | null;

    constructor(opts: HandleOptions) {
        this[id] = nextId++;

        if (opts.name) this.name = opts.name;

        if (opts.target !== undefined) {
            this.unresolvedTarget = opts.target;
            if (opts.target === null) this.associate(null);
        }
    }

    associate = (el: AdaptElement | null) => {
        const orig = this[origElement];
        if (orig !== undefined) {
            const path = isMountedElement(orig) ? orig.path : "<not mounted>";
            throw new Error(
                `Cannot associate a Handle with more than one AdaptElement. ` +
                `Original element type ${orig && orig.componentName}, ` +
                `path: ${path}, ` +
                `second association element type ${el && el.componentName}`);
        }
        this[origElement] = el;
    }

    get associated(): boolean {
        return this[origElement] !== undefined;
    }

    replaceTarget = (el: AdaptElement | null, buildId: BuildId) => {
        const orig = this[origElement];
        if (orig == null) {
            throw new Error(`A Handle must first be associated with an ` +
                `Element before replaceTarget can be called`);
        }

        if (this.buildNum === undefined || buildId.buildNum > this.buildNum) {
            this.buildNum = buildId.buildNum;

            // Replacing with origElement doesn't modify anything (and importantly,
            // doesn't create a loop for target).
            if (el === this[origElement]) return;

            this.childElement = el;
            return; // Success
        }

        if (this.buildNum === buildId.buildNum) {
            throw new Error(`Cannot call replaceTarget on a Handle more than once`);
        }

        throw new Error(`Cannot call replaceTarget on a Handle with an ` +
            `older build iteration. ${this.origDebug()} ` +
            `(this.buildNum=${this.buildNum} ` +
            `buildId.buildNum=${buildId.buildNum})`);
    }

    targetReplaced(buildId: BuildId): boolean {
        return this.buildNum === buildId.buildNum &&
            this.childElement !== undefined;
    }

    get id() {
        return this[id];
    }

    get origTarget(): AdaptElement | null | undefined {
        const orig = this[origElement];
        return orig;
    }

    get mountedOrig(): AdaptMountedElement | null | undefined {
        return this.nextMounted();
    }

    nextMounted(pred: ElementPredicate = () => true): AdaptMountedElement | null | undefined {
        const elem = traverseUntil(this, (hand) => {
            return isMountedElement(hand.origTarget) && pred(hand.origTarget);
        }) as AdaptMountedElement;
        if (elem == null) return elem;
        if (!isMountedElement(elem)) return undefined;
        return elem;
    }

    get target(): AdaptElement | null | undefined {
        if (this.origTarget === undefined) return undefined;
        return traverseUntil(this, () => false);
    }

    toString() {
        return `Handle(${this.id})`;
    }

    toJSON(): HandleObj {
        const el = this.target;
        const target = isMountedElement(el) ? el.keyPath : null;
        return {
            __adaptIsHandle: handleSignature,
            name: this.name,
            target,
            urn: handleUrn
        };
    }

    origDebug() {
        const orig = this[origElement];
        if (orig === undefined) return "Original element: <unassociated>";
        if (orig === null) return "Original element: <null>";
        const path = isMountedElement(orig) ? orig.path : "<not mounted>";
        const name = orig.componentName || "<anonymous>";
        return `Original element type ${name}, path: ${path}`;
    }
}
tagConstructor(HandleImpl, "adapt");

function isHandleImpl(val: unknown): val is HandleImpl {
    return isInstance(val, HandleImpl, "adapt");
}

/**
 * User-facing API for creating a Handle
 * @param name Name to associate with the handle for debugging/display purposes
 */
export function handle(name?: string): Handle {
    return new HandleImpl({ name });
}

registerObject(HandleImpl, "HandleImpl", module);

export const handleUrn = findMummyUrn(HandleImpl);
