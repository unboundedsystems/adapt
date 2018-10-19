import * as ld from "lodash";
import * as xmlbuilder from "xmlbuilder";

import { AdaptElement, AdaptElementOrNull, isElement } from ".";
import { Handle, handleUrn, isHandle } from "./handle";
import { childrenToArray, isComponentElement } from "./jsx";
import { findMummyUrn } from "./reanimate";

interface PreparedProps {
    [key: string]: string | Handle;
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
    const long = serializeLongPropVal(propVal, false);
    if (ld.isString(long) && ld.isString(propVal)) {
        return long.slice(1, -1);
    }
    return long;
}

function serializeLongPropVal(propVal: any, pretty = true): string | Handle {
    if (isHandle(propVal)) return propVal;
    const json = JSON.stringify(propVal, null, pretty ? 2 : undefined);
    if (json != null) return json;
    return propVal.toString();
}

function collectProps(elem: AdaptElement) {
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
            longProps[propName] = serializeLongPropVal(prop);
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
        if (isHandle(prop)) {
            const n = propsNode.ele("prop", { name: propName });
            serializeHandle(n, prop, reanimateable);
        } else {
            propsNode.ele("prop", { name: propName }, prop);
        }
    }
}

function serializeChildren(
    node: xmlbuilder.XMLElementOrXMLNode,
    elem: AdaptElement,
    reanimateable: boolean,
): void {

    const children: any[] = childrenToArray(elem.props.children);

    for (const child of children) {
        switch (true) {
            case isElement(child):
                serializeElement(node, child, reanimateable);
                break;

            case isHandle(child):
                serializeHandle(node, child, reanimateable);
                break;

            default:
                const serChild = JSON.stringify(child, null, 2);
                if (serChild == null) {
                    node.ele("typescript", {}).cdata(child.toString());
                } else {
                    node.ele("json", {}, serChild);
                }
        }
    }
}

function getUrn(elem: AdaptElement) {
    if (!isComponentElement(elem)) {
        throw new Error(
            `Unable to create reanimateable representation of ` +
            `'${elem.componentType.name}' because it doesn't extend ` +
            `Adapt.Component`);
    }

    try {
        return findMummyUrn(elem.componentType);
    } catch { /**/ }

    // Ensure component is registered by constructing one
    try { new elem.componentType({}); } catch { /**/ }

    return findMummyUrn(elem.componentType);
}

function serializeElement(
    parent: xmlbuilder.XMLElementOrXMLNode,
    elem: AdaptElement,
    reanimateable: boolean,
): void {
    const { shortProps, longProps } = collectProps(elem);
    let node: xmlbuilder.XMLElementOrXMLNode;

    if (reanimateable) {
        const urn = getUrn(elem);
        node = parent.ele(elem.componentType.name, { ...shortProps, xmlns: urn });
    } else {
        node = parent.ele(elem.componentType.name, shortProps);
    }
    if (longProps != null) {
        addPropsNode(node, longProps, reanimateable);
    }
    serializeChildren(node, elem, reanimateable);
}

function serializeHandle(
    parent: xmlbuilder.XMLElementOrXMLNode,
    hand: Handle,
    reanimateable: boolean,
): void {
    const attrs = reanimateable ? { xmlns: handleUrn } : {};
    parent.ele("Handle", attrs, JSON.stringify(hand, null, 2));
}

export function serializeDom(root: AdaptElementOrNull, reanimateable = false): string {
    const doc = xmlbuilder.create("Adapt");
    if (root != null) serializeElement(doc, root, reanimateable);
    doc.end({
        headless: true,
        pretty: true
    });
    return doc.toString();
}
