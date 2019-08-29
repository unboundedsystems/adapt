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

import { AdaptElement, Handle, handle, useMethod } from "@adpt/core";
import ld from "lodash";

export interface HandlesCreate {
    create: HandlesIndex;
}

export interface HandlesIndex {
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
    if (Object.hasOwnProperty.call(proto, prop)) return true;
    const protoPropDesc = Object.getOwnPropertyDescriptor(proto, prop);
    if (protoPropDesc && protoPropDesc.get) return true;
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
            if (!ld.isString(prop)) {
                throw new Error(`Internal error. Non-string property should ` +
                `have been proxied to Handle`);
            }

            if (hand.origTarget === undefined) {
                throw new Error(`Cannot access method '${prop}' on Handle ` +
                    `because the Handle has not been associated to any Element`);
            }

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
        create: new Proxy<HandlesIndex>({} as HandlesIndex, {
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
