import { Logger } from "@usys/utils";
import {
    AdaptElement,
    AdaptMountedElement,
    childrenToArray,
    ElementID,
    isMountedElement,
} from "./jsx";

export interface DomDiff {
    added: Set<AdaptMountedElement>;
    deleted: Set<AdaptMountedElement>;
    commonOld: Set<AdaptMountedElement>;
    commonNew: Set<AdaptMountedElement>;
}

export function domForEach(dom: AdaptMountedElement | null, f: (el: AdaptMountedElement) => void): void {
    if (dom == null) return;

    f(dom);
    childrenToArray(dom.props.children)
        .forEach((c) => isMountedElement(c) && domForEach(c, f));
}

export function domMap<T>(dom: AdaptMountedElement | null, f: (el: AdaptMountedElement) => T): T[] {
    const ret: T[] = [];
    domForEach(dom, (el) => ret.push(f(el)));
    return ret;
}

export type DomDiffIdFunc = (el: AdaptMountedElement) => string;

export const defaultDomDiffId: DomDiffIdFunc = (el) => el.id;

export function domDiff(
    oldDom: AdaptMountedElement | null,
    newDom: AdaptMountedElement | null,
    idFunc = defaultDomDiffId
    ): DomDiff {

    const byId = new Map<ElementID, AdaptMountedElement>();
    const added = new Set<AdaptMountedElement>();
    const deleted = new Set<AdaptMountedElement>();
    const commonOld = new Set<AdaptMountedElement>();
    const commonNew = new Set<AdaptMountedElement>();

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
export function domActiveElems(diff: DomDiff): AdaptMountedElement[] {
    // This implementation (with Array.from & concat) may seem slightly
    // odd to look at, but if we have really large DOMs, it avoids the
    // JS arg length hard limits that could happen when using the spread
    // operator or apply.
    const a: AdaptMountedElement[] = [];
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
