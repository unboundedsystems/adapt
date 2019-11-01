/*
 * Copyright 2018-2019 Unbounded Systems, LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { isInstance, sha256hex, tagConstructor } from "@adpt/utils";
import { InternalError } from "./error";
import {
    AdaptElement,
    AdaptMountedElement,
    ElementPredicate,
    GenericInstance,
    GenericInstanceMethods,
    isMountedElement,
    KeyPath,
} from "./jsx";
import { findMummyUrn, registerObject } from "./reanimate";

export interface Handle
    <I extends object = GenericInstance> extends Readonly<Partial<BuildId>> {
    readonly associated: boolean;
    readonly target: AdaptElement | null | undefined;
    readonly origTarget: AdaptElement | null | undefined;
    readonly mountedOrig: AdaptMountedElement | null | undefined;
    readonly name?: string;
    nextMounted(pred?: ElementPredicate): AdaptMountedElement | null | undefined;
    replaceTarget(child: AdaptElement | null, buildId: BuildId): void;
}

/**
 * Extracts the instance type associated with a {@link Handle}.
 * @public
 */
export type HandleInstanceType<H extends Handle> = H extends Handle<infer I> ? I : never;

export function isHandle<I extends object = GenericInstance>(val: unknown): val is Handle<I> {
    return isHandleImpl(val);
}

export interface HandleInternal<I extends object = GenericInstance> extends Handle<I> {
    unresolvedTarget?: KeyPath | null;

    associate(el: AdaptElement): void;
    targetReplaced(buildId: BuildId): boolean;
}

export interface BuildId {
    buildNum: number;
}

export function isHandleInternal
    <I extends object = GenericInstance>(val: unknown): val is HandleInternal<I> {
    return isHandleImpl(val);
}

export function getInternalHandle
    <I extends object = GenericInstance>(el: AdaptElement): HandleInternal<I> {
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

/**
 * Find the Element corresponding to the first handle in the chain for which
 * `pred` returns true.
 * @remarks
 * In the case that the predicate returns true for `hand`, the Element
 * associated with `hand` will be returned.
 * @returns
 * The Element associated to the first handle in the chain for which the
 * predicate returns true.
 * If no handles in the chain satisfy the predicate, the function returns
 * `null` if the chain built to `null`, otherwise `undefined`.
 * @internal
 */
function findFirst(hand: HandleImpl, pred: (hand: HandleImpl) => boolean) {
    while (!pred(hand)) {
        const orig = hand.origTarget;
        if (orig === undefined) {
            throw new InternalError(`Handle chain has undefined origTarget`);
        }

        // We've reached the end of the chain without finding a Handle that
        // matches the predicate.
        if (hand.childElement == null) return hand.childElement;

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

/**
 * Return the Element associated with the last Handle in the chain.
 * If the chain ends with `null`, returns `null`.
 */
function findLast(hand: HandleImpl) {
    while (true) {
        const orig = hand.origTarget;
        if (orig === undefined) {
            throw new InternalError(`Handle chain has undefined origTarget`);
        }
        if (hand.childElement === undefined) return hand.origTarget;

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
        const elem = findFirst(this, (hand) => {
            return isMountedElement(hand.origTarget) && pred(hand.origTarget);
        }) as AdaptMountedElement;
        if (elem == null) return elem;
        if (!isMountedElement(elem)) return undefined;
        return elem;
    }

    get target(): AdaptElement | null | undefined {
        if (this.origTarget === undefined) return undefined;
        return findLast(this);
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
 * @param name - Name to associate with the handle for debugging/display purposes
 */
export function handle<I extends object = GenericInstance>(name?: string): Handle<I & GenericInstanceMethods> {
    return new HandleImpl({ name });
}

registerObject(HandleImpl, "HandleImpl", module);

export const handleUrn = findMummyUrn(HandleImpl);
