import {
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

export function domDiff(
    oldDom: AdaptMountedElement | null, newDom: AdaptMountedElement | null): DomDiff {

    const byId = new Map<ElementID, AdaptMountedElement>();
    const added = new Set<AdaptMountedElement>();
    const deleted = new Set<AdaptMountedElement>();
    const commonOld = new Set<AdaptMountedElement>();
    const commonNew = new Set<AdaptMountedElement>();

    domForEach(oldDom, (el) => byId.set(el.id, el));
    domForEach(newDom, (el) => {
        const id = el.id;
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
