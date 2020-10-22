/*
 * Copyright 2018-2020 Unbounded Systems, LLC
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

import * as ld from "lodash";
import * as util from "util";
import * as xmlbuilder from "xmlbuilder";

import { stringifyJson5 } from "@adpt/utils";
import { InternalError } from "./error";
import {
    AdaptElement,
    AdaptElementImpl,
    AdaptElementOrNull,
    AdaptMountedElement,
    AnyProps,
    childrenToArray,
    isComponentElement,
    isElement,
    isElementImpl,
    isMountedElement
} from "./jsx";
import { findMummyUrn } from "./reanimate";

export interface SerializeOptions {
    reanimateable: boolean;
    props: "all" | "none" | string[];
}

const defaultSerializeOptions: SerializeOptions = {
    reanimateable: false,
    props: "all",
};

interface PreparedProps {
    [key: string]: string;
}

interface AnyObj {
    [key: string]: any;
}

function serializeAny(val: any, reanimateable: boolean): string | null | undefined {
    return stringifyJson5(val, {
        quote: `"`,
        replacer: serializeSpecials(reanimateable),
        space: 2,
        useUndefined: true,
    });
}

function serializeSpecials(reanimateable: boolean): ((this: AnyObj, key: string, value: any) => any) {
    return function (this: AnyObj, key: string, value: any) {
        return value;
    };
}

function serializedShortPropIsString(propVal: string): boolean {
    return !(/^\d/.test(propVal));
}

function canBeShort(propName: string, propVal: any): boolean {
    if (propName === "xmlns" || propName.startsWith("xmlns:")) return false;
    if (ld.isNumber(propVal)) return true;
    if (ld.isString(propVal)) {
        const json = JSON.stringify(propVal);
        return (json.length < 10) && serializedShortPropIsString(json.slice(1, -1));
    }
    return false;
}

function serializeShortPropVal(propVal: any) {
    const long = serializeLongPropVal(propVal, false, false);
    if (ld.isString(long) && ld.isString(propVal)) {
        return long.slice(1, -1);
    }
    return long;
}

function serializeLongPropVal(propVal: any, pretty = true, reanimateable = true): string {
    const json = stringifyJson5(propVal, {
        quote: `"`,
        replacer: serializeSpecials(reanimateable),
        space: pretty ? 2 : undefined,
        useUndefined: true,
    });
    if (json != null) return json;
    return propVal.toString();
}

function collectProps(elem: AdaptElement, options: SerializeOptions) {
    const props = elem.props;
    const shortProps: PreparedProps = {};
    let longProps: PreparedProps | null = null;

    let propNames: string[];
    switch (options.props) {
        case "all":
            propNames = Object.keys(props).sort();
            break;
        case "none":
            propNames = [];
            break;
        default:
            if (!Array.isArray(options.props)) {
                throw new InternalError(`Invalid value '${options.props}' for options.props`);
            }
            propNames = options.props;
    }

    for (const propName of propNames) {
        if (propName === "children" || propName === "handle") continue;

        const prop = props[propName];

        if (canBeShort(propName, prop)) {
            shortProps[propName] = serializeShortPropVal(prop);
        } else {
            if (longProps == null) {
                longProps = {};
            }
            longProps[propName] = serializeLongPropVal(prop, true, options.reanimateable);
        }
    }

    return { shortProps, longProps };
}

function addPropsNode(
    node: xmlbuilder.XMLElement,
    props: PreparedProps,
): void {
    const propsNode = node.ele("__props__", {});
    for (const propName in props) {
        if (!props.hasOwnProperty(propName)) continue;
        const prop = props[propName];
        propsNode.ele("prop", { name: propName }, prop);
    }
}

function serializeChildren(
    context: SerializationContext,
    node: xmlbuilder.XMLElement,
    children: any[],
    options: SerializeOptions,
): void {
    for (const child of children) {
        switch (true) {
            case isElement(child):
                serializeElement(context, node, child, options);
                break;
            default:
                const serChild = serializeAny(child, options.reanimateable);
                if (serChild == null) {
                    node.ele("typescript", {}).cdata(child.toString());
                } else {
                    node.ele("json", {}, serChild);
                }
        }
    }
}

function serializeChildrenFromElem(
    context: SerializationContext,
    node: xmlbuilder.XMLElement,
    elem: AdaptElement,
    options: SerializeOptions,
): void {
    const children: any[] = childrenToArray(elem.props.children);
    serializeChildren(context, node, children, options);
}

function getUrn(elem: AdaptElement) {
    if (!isComponentElement(elem)) {
        throw new Error(
            `Unable to create reanimateable representation of ` +
            `'${elem.componentName}' because it doesn't extend ` +
            `Adapt.Component`);
    }

    try {
        return findMummyUrn(elem.componentType);
    } catch { /**/ }

    // Ensure component is registered by constructing one
    try { new elem.componentType({}); } catch { /**/ }

    return findMummyUrn(elem.componentType);
}

function serializeBuildData(
    context: SerializationContext,
    parent: xmlbuilder.XMLElement,
    elem: AdaptElementImpl<AnyProps>,
    options: SerializeOptions,
) {
    const bdNode = parent.ele("buildData", {});
    const succ = elem.buildData.successor;
    const origChildren = elem.buildData.origChildren;
    if (succ !== undefined) {
        const isNull = succ === null;
        const succNode = bdNode.ele("successor", { isNull });
        //We can just serialize here because only an element or its successor can appear in a dom, not both
        if (succ !== null) serializeElement(context, succNode, succ, options);
    }
    if (origChildren !== undefined) {
        const origChildrenNode = bdNode.ele("origChildren", {});
        serializeChildren(context, origChildrenNode, origChildren, options);
    }
}

function addLifecycleNode(
    context: SerializationContext,
    parent: xmlbuilder.XMLElement,
    elem: AdaptMountedElement,
    options: SerializeOptions,
): void {
    if (!isElementImpl(elem)) throw new Error(`Element not an ElementImpl: ${util.inspect(elem)}`);
    const lcNode = parent.ele("__lifecycle__", {});
    lcNode.ele("field", { name: "stateNamespace" }, JSON.stringify(elem.stateNamespace));
    lcNode.ele("field", { name: "keyPath" }, JSON.stringify(elem.keyPath));
    lcNode.ele("field", { name: "path" }, JSON.stringify(elem.path));
    if ("Enable this when we figure out how to serialize and reanimate SFCs".length === 0) {
        serializeBuildData(context, lcNode, elem, options);
    }
}

function serializeElement(
    context: SerializationContext,
    parent: xmlbuilder.XMLElement,
    elem: AdaptElement,
    options: SerializeOptions,
): void {
    if (context.serializedElements.has(elem) && isMountedElement(elem)) {
        parent.ele("__elementRef__", { ref: elem.id });
        return;
    }

    const { shortProps, longProps } = collectProps(elem, options);
    let node: xmlbuilder.XMLElement;

    if (options.reanimateable) {
        const urn = getUrn(elem);
        node = parent.ele(elem.componentName, { ...shortProps, xmlns: urn });
    } else {
        node = parent.ele(elem.componentName, shortProps);
    }
    if (longProps != null) {
        addPropsNode(node, longProps);
    }
    serializeChildrenFromElem(context, node, elem, options);
    if (isMountedElement(elem) && options.reanimateable) {
        context.work.push(() => addLifecycleNode(context, node, elem, options));
    }
}

interface SerializationContext {
    serializedElements: Set<AdaptElement>;
    work: (() => void)[];
}

export function serializeDom(root: AdaptElementOrNull, options: Partial<SerializeOptions> = {}): string {
    const opts = { ...defaultSerializeOptions, ...options };
    if (opts.reanimateable && opts.props !== "all") {
        throw new Error(`Invalid options for serializeDom: props must be "all" when reanimateable is true`);
    }
    const context: SerializationContext = {
        serializedElements: new Set<AdaptElement>(),
        work: []
    };
    const doc = xmlbuilder.create("Adapt", { headless: true });
    if (root != null) serializeElement(context, doc, root, opts);
    while (context.work.length > 0) {
        const toDo = context.work.shift();
        if (toDo) toDo();
    }
    return doc.end({
        pretty: true
    }) + "\n";
}
