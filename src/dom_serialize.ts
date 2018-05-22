import * as ld from "lodash";
import * as xmlbuilder from "xmlbuilder";

import { isElement, UnbsElement } from ".";

interface PreparedProps {
    [key: string]: string;
}

function serializedShortPropIsString(propVal: string): boolean {
    return !(/^\d/.test(propVal));
}

function canBeShort(propVal: any): boolean {
    if (ld.isNumber(propVal)) return true;
    if (ld.isString(propVal)) {
        const json = JSON.stringify(propVal);
        return (json.length < 10) && !serializedShortPropIsString(json.slice(1, -1));
    }
    return false;
}

function makeShortPropVal(propVal: any) {
    const json = JSON.stringify(propVal);

    if (ld.isString(propVal)) {
        return json.slice(1, -1);
    }
    return json;
}

function collectProps(elem: UnbsElement) {
    const props = elem.props;
    const shortProps: PreparedProps = {};
    let longProps: PreparedProps | null = null;
    for (const propName in props) {
        if (!props.hasOwnProperty(propName)) continue;
        if (propName === "children") continue;

        const prop = props[propName];
        if (canBeShort(prop)) {
            shortProps[propName] = makeShortPropVal(prop);
        } else {
            if (longProps == null) {
                longProps = {};
            } else {
                longProps[propName] = JSON.stringify(prop);
            }
        }
    }

    return { shortProps, longProps };
}

function addPropsNode(node: xmlbuilder.XMLElementOrXMLNode, props: PreparedProps): void {
    const propsNode = node.ele("__props__", {});
    for (const propName in props) {
        if (!props.hasOwnProperty(propName)) continue;
        const prop = props[propName];
        propsNode.ele("prop", { name: propName }, JSON.stringify(prop, null, 2));
    }
}

function serializeChildren(
    node: xmlbuilder.XMLElementOrXMLNode,
    elem: UnbsElement): void {

    let children: any[] = [];
    if ((elem.props.children != null)
        && ld.isArray(elem.props.children)
        && (elem.props.children.length !== 0)) {
        children = elem.props.children;
    }

    for (const child of children) {
        if (isElement(child)) {
            serializeElement(node, child);
        } else {
            const serChild = JSON.stringify(child);
            if (serChild == null) {
                node.ele("typescript", {}, child.toString());
            } else {
                node.ele("JSON", {}, JSON.stringify(child));
            }
        }
    }
}

function serializeElement(parent: xmlbuilder.XMLElementOrXMLNode, elem: UnbsElement): void {
    const { shortProps, longProps } = collectProps(elem);
    const node = parent.ele(elem.componentType.name, shortProps);
    if (longProps != null) {
        addPropsNode(node, longProps);
    }
    serializeChildren(node, elem);
}

export function serializeDom(root: UnbsElement): string {
    const doc = xmlbuilder.create("unbs");
    serializeElement(doc, root);
    return doc.toString();
}
