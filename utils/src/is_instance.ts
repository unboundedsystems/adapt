import { isObject } from "lodash";

const preTag = "isInstance:";

// tslint:disable-next-line: ban-types
export function isInstance(val: any, ctorOrTag: string | Function, scope?: string): boolean {
    if (!val || !isObject(val)) return false;
    const tag = typeof ctorOrTag === "string" ? ctorOrTag : ctorOrTag.name;
    scope = scope ? scope + ":" : "";
    return val[Symbol.for(preTag + scope + tag)] === true;
}

export function tagInstance(val: object, tag?: string, scope?: string) {
    if (tag === undefined) tag = val.constructor.name;
    scope = scope ? scope + ":" : "";
    (val as any)[Symbol.for(preTag + scope + tag)] = true;
}

// tslint:disable-next-line: ban-types
export function tagConstructor(ctor: Function, scope?: string, tag?: string) {
    tagInstance(ctor.prototype, tag, scope);
}
