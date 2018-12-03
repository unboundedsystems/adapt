import * as ld from "lodash";
import * as util from "util";
import * as xmlbuilder from "xmlbuilder";

import { AdaptElement, AdaptElementOrNull, isElement } from ".";
import {
    AdaptElementImpl,
    AdaptMountedElement,
    AnyProps,
    childrenToArray,
    isComponentElement,
    isElementImpl,
    isMountedElement
} from "./jsx";
import { findMummyUrn } from "./reanimate";

interface PreparedProps {
    [key: string]: string;
}

interface AnyObj {
    [key: string]: any;
}

function serializeAny(val: any, reanimateable: boolean): string | null | undefined {
    return JSON.stringify(val, serializeSpecials(reanimateable), 2);
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
    const json = JSON.stringify(propVal, serializeSpecials(reanimateable), pretty ? 2 : undefined);
    if (json != null) return json;
    return propVal.toString();
}

function collectProps(elem: AdaptElement, reanimateable: boolean) {
    const props = elem.props;
    const shortProps: PreparedProps = {};
    let longProps: PreparedProps | null = null;
    for (const propName of Object.keys(props).sort()) {
        if (propName === "children" || propName === "handle") continue;

        const prop = props[propName];
        if (prop === undefined) continue;

        if (canBeShort(propName, prop)) {
            shortProps[propName] = serializeShortPropVal(prop);
        } else {
            if (longProps == null) {
                longProps = {};
            }
            longProps[propName] = serializeLongPropVal(prop, true, reanimateable);
        }
    }

    return { shortProps, longProps };
}

function addPropsNode(
    node: xmlbuilder.XMLElementOrXMLNode,
    props: PreparedProps,
    reanimateable: boolean
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
    node: xmlbuilder.XMLElementOrXMLNode,
    children: any[],
    reanimateable: boolean
): void {
    for (const child of children) {
        switch (true) {
            case isElement(child):
                serializeElement(context, node, child, reanimateable);
                break;
            default:
                const serChild = serializeAny(child, reanimateable);
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
    node: xmlbuilder.XMLElementOrXMLNode,
    elem: AdaptElement,
    reanimateable: boolean,
): void {
    const children: any[] = childrenToArray(elem.props.children);
    serializeChildren(context, node, children, reanimateable);
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
    parent: xmlbuilder.XMLElementOrXMLNode,
    elem: AdaptElementImpl<AnyProps>
) {
    const bdNode = parent.ele("buildData", {});
    const succ = elem.buildData.successor;
    const origChildren = elem.buildData.origChildren;
    if (succ !== undefined) {
        const isNull = succ === null;
        const succNode = bdNode.ele("successor", { isNull });
        //We can just serialize here because only an element or its successor can appear in a dom, not both
        if (succ !== null) serializeElement(context, succNode, succ, true);
    }
    if (origChildren !== undefined) {
        const origChildrenNode = bdNode.ele("origChildren", {});
        serializeChildren(context, origChildrenNode, origChildren, true);
    }
}

function addLifecycleNode(
    context: SerializationContext,
    parent: xmlbuilder.XMLElementOrXMLNode,
    elem: AdaptMountedElement
): void {
    if (!isElementImpl(elem)) throw new Error(`Element not an ElementImpl: ${util.inspect(elem)}`);
    const lcNode = parent.ele("__lifecycle__", {});
    lcNode.ele("field", { name: "stateNamespace" }, JSON.stringify(elem.stateNamespace));
    lcNode.ele("field", { name: "keyPath" }, JSON.stringify(elem.keyPath));
    lcNode.ele("field", { name: "path" }, JSON.stringify(elem.path));
    if ("Enable this when we figure out how to serialize and reanimate SFCs".length === 0) {
        serializeBuildData(context, lcNode, elem);
    }
}

function serializeElement(
    context: SerializationContext,
    parent: xmlbuilder.XMLElementOrXMLNode,
    elem: AdaptElement,
    reanimateable: boolean,
): void {
    if (context.serializedElements.has(elem) && isMountedElement(elem)) {
        parent.ele("__elementRef__", { ref: elem.id });
        return;
    }

    const { shortProps, longProps } = collectProps(elem, reanimateable);
    let node: xmlbuilder.XMLElementOrXMLNode;

    if (reanimateable) {
        const urn = getUrn(elem);
        node = parent.ele(elem.componentName, { ...shortProps, xmlns: urn });
    } else {
        node = parent.ele(elem.componentName, shortProps);
    }
    if (longProps != null) {
        addPropsNode(node, longProps, reanimateable);
    }
    serializeChildrenFromElem(context, node, elem, reanimateable);
    if (isMountedElement(elem) && reanimateable) {
        context.work.push(() => addLifecycleNode(context, node, elem));
    }
}

interface SerializationContext {
    serializedElements: Set<AdaptElement>;
    work: (() => void)[];
}

export function serializeDom(root: AdaptElementOrNull, reanimateable = false): string {
    const context: SerializationContext = {
        serializedElements: new Set<AdaptElement>(),
        work: []
    };
    const doc = xmlbuilder.create("Adapt");
    if (root != null) serializeElement(context, doc, root, reanimateable);
    while (context.work.length > 0) {
        const toDo = context.work.shift();
        if (toDo) toDo();
    }
    doc.end({
        headless: true,
        pretty: true
    });
    return doc.toString();
}
