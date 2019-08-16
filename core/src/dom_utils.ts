/*
 * Copyright 2019 Unbounded Systems, LLC
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

import { Logger } from "@adpt/utils";
import {
    AdaptElement,
    AdaptMountedElement,
    childrenToArray,
    ElementID,
    isMountedElement,
} from "./jsx";

export interface DomDiff<E extends AdaptMountedElement = AdaptMountedElement> {
    added: Set<E>;
    deleted: Set<E>;
    commonOld: Set<E>;
    commonNew: Set<E>;
}

export function domForEach
    <E extends AdaptMountedElement = AdaptMountedElement>(dom: E | null, f: (el: E) => void): void {
    if (dom == null) return;

    f(dom);
    childrenToArray(dom.props.children)
        .forEach((c) => isMountedElement(c) && domForEach(c as E, f));
}

export function domMap
    <T, E extends AdaptMountedElement = AdaptMountedElement>(dom: E | null, f: (el: E) => T): T[] {
    const ret: T[] = [];
    domForEach(dom, (el) => ret.push(f(el)));
    return ret;
}

export type DomDiffIdFunc = (el: AdaptMountedElement) => string;

export const defaultDomDiffId: DomDiffIdFunc = (el) => el.id;

export function domDiff<E extends AdaptMountedElement = AdaptMountedElement> (
    oldDom: E | null,
    newDom: E | null,
    idFunc = defaultDomDiffId
    ): DomDiff<E> {

    const byId = new Map<ElementID, E>();
    const added = new Set<E>();
    const deleted = new Set<E>();
    const commonOld = new Set<E>();
    const commonNew = new Set<E>();

    domForEach(oldDom, (el) => byId.set(idFunc(el), el));
    domForEach(newDom, (el) => {
        const id = idFunc(el);
        const old = byId.get(id);
        if (old) {
            commonOld.add(old);
            commonNew.add(el);
            byId.delete(id);
        } else {
            added.add(el);
        }
    });
    byId.forEach((el) => deleted.add(el));

    return { added, deleted, commonOld, commonNew };
}

/**
 * Given a DomDiff, generated from an old and new DOM, returns an Array of
 * the Elements that will be active if this DomDiff is deployed. That means
 * all of the Elements in the new DOM plus the deleted Elements from the
 * old DOM.
 */
export function domActiveElems
    <E extends AdaptMountedElement = AdaptMountedElement>(diff: DomDiff<E>): E[] {
    // This implementation (with Array.from & concat) may seem slightly
    // odd to look at, but if we have really large DOMs, it avoids the
    // JS arg length hard limits that could happen when using the spread
    // operator or apply.
    const a: E[] = [];
    return a.concat(
        Array.from(diff.added),
        Array.from(diff.commonNew),
        Array.from(diff.deleted),
    );
}

export function logElements(msg: string, elements: AdaptElement[], logger: Logger) {
    const els = elements.map((el) => {
        let path = "[not mounted]";
        let id = "[not mounted]";
        if (isMountedElement(el)) {
            path = el.path;
            id = el.id;
        }
        return `${el.componentName} (key=${el.props.key})\n  path: ${path}\n  ID: ${id}`;
    });
    logger(msg + els.join("\n"));
}
