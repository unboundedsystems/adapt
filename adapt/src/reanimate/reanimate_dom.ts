import { domFromString, DOMNode, isDOMNode, isDOMObject } from "@usys/dom-parser";
import { Constructor } from "@usys/utils";
import { HandleInternal, isHandleInternal } from "../handle";
import {
    AdaptElement,
    AdaptElementOrNull,
    AnyProps,
    AnyState,
    childrenToArray,
    ClassComponentTyp,
    createElement,
    KeyPath,
} from "../jsx";
import { reanimateUrn } from "./reanimate";

type KeyPathJson = string;

interface HandleReg {
    handles: HandleInternal[];
    nodes: Map<KeyPathJson, AdaptElement>;
}

export async function reanimateDom(xmlString: string): Promise<AdaptElementOrNull> {
    const domNodesRoot = await domFromString(xmlString);
    if (domNodesRoot === null) return null;

    const handleReg = {
        handles: [],
        nodes: new Map<string, AdaptElement>(),
    };

    const dom = await reanimateNode(domNodesRoot, [], handleReg);
    resolveHandles(handleReg);
    return dom;
}

async function reanimateNode(
    domNode: DOMNode,
    parentPath: KeyPath,
    handleReg: HandleReg
): Promise<AdaptElement> {

    const nodeKey = domNode.props.key;
    if (typeof nodeKey !== "string") throw new Error(`Invalid DOM XML. Element with no key`);

    const keyPath = parentPath.concat([nodeKey]);
    const component: ClassComponentTyp<AnyProps, AnyState> =
        await reanimateUrn(domNode.uri);

    const pChildren = childrenToArray(domNode.props.children).map(async (c) => {
        if (!isDOMNode(c)) return c;
        return reanimateNode(c, keyPath, handleReg);
    });
    const children = await Promise.all(pChildren);

    // Reanimate any DOMObjects
    const props: AnyProps = {};
    for (const k of Object.keys(domNode.props)) {
        let prop = domNode.props[k];
        if (isDOMObject(prop)) {
            const ctor: Constructor<any> = await reanimateUrn(prop.uri);
            prop = new ctor(prop.data);

            if (isHandleInternal(prop) && prop.unresolvedTarget !== null) {
                handleReg.handles.push(prop);
            }
        }
        props[k] = prop;
    }

    const node = createElement(component, props, ...children);

    handleReg.nodes.set(JSON.stringify(keyPath), node);

    return node;
}

function resolveHandles(handleReg: HandleReg) {
    for (const hand of handleReg.handles) {
        const target = hand.unresolvedTarget;
        if (target == null) throw new Error(`Internal error: target is null`);
        const node = handleReg.nodes.get(JSON.stringify(target));
        if (node == null) throw new Error(`DOM reanimation error: cannot find DOM node path '${target}'`);

        hand.associate(node);
    }
}
