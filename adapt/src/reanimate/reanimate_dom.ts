import { domFromString, DOMNode, isDOMNode } from "@usys/dom-parser";
import {
    AdaptElement,
    AdaptElementOrNull,
    AnyProps,
    AnyState,
    childrenToArray,
    ClassComponentTyp,
    createElement
} from "../jsx";
import { reanimateUrn } from "./reanimate";

export async function reanimateDom(xmlString: string): Promise<AdaptElementOrNull> {
    const domNodesRoot = await domFromString(xmlString);
    if (domNodesRoot === null) return null;

    return reanimateNode(domNodesRoot);
}

async function reanimateNode(domNode: DOMNode): Promise<AdaptElement> {
    const component: ClassComponentTyp<AnyProps, AnyState> =
        await reanimateUrn(domNode.uri);

    const pChildren = childrenToArray(domNode.props.children).map(async (c) => {
        if (!isDOMNode(c)) return c;
        return reanimateNode(c);
    });
    const children = await Promise.all(pChildren);

    return createElement(component, domNode.props, ...children);
}
