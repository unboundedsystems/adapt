import { AdaptElement, Handle, handle } from "@usys/adapt";
import ld from "lodash";
import { useMethod } from "./hooks";

//Move to separate file
interface HandleIndex {
    [name: string]: ExtendedHandle;
}

interface HandlesCreate {
    create: HandleIndex;
}

interface HandlesIndex {
    [hand: string]: ExtendedHandle;
}

export type Handles = HandlesCreate & HandlesIndex;

export interface ExtendedHandle extends Handle {
    [method: string]: any;
}

function proxyToHandle(hand: Handle, prop: string | number | symbol) {
    if (!ld.isString(prop)) return true;
    if (Object.hasOwnProperty.call(hand, prop)) return true;
    const propDesc = Object.getOwnPropertyDescriptor(hand, prop);
    if (propDesc && propDesc.get) return true;
    const proto = Object.getPrototypeOf(hand);
    const protoPropDesc = Object.getOwnPropertyDescriptor(proto, prop);
    if (protoPropDesc && protoPropDesc.get) return true;
    if (hand.origTarget === undefined) return true;
    return false;
}

function computeDefault(elem: AdaptElement | null | undefined, prop: string) {
    if (elem == null) return undefined;
    const defsObj = (elem.componentType as any).defaults;
    return defsObj && defsObj[prop];
}

export function extendedHandle() {
    const wrap = handle();
    return new Proxy(wrap, {
        get: (hand, prop, _rx) => {
            if (proxyToHandle(hand, prop)) return (hand as any)[prop];
            if (!ld.isString(prop)) return (hand as any)[prop];

            const defVal = computeDefault(hand.origTarget, prop);
            return (...args: any[]) => {
                return useMethod(hand, defVal, prop, ...args);
            };
        }
    });
}

export function handles() {
    const ret: Handles = ({
        // tslint:disable-next-line:no-object-literal-type-assertion
        create: new Proxy<HandleIndex>({} as HandleIndex, {
            get: (_target: any, prop: string | number | symbol, _rx: unknown) => {
                if (!ld.isString(prop)) return undefined;
                const hand = extendedHandle();
                ret[prop] = hand;
                return hand;
            }
        })
    }) as Handles;
    return ret;
}
