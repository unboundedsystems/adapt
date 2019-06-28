import { domFromString, DOMNode, isDOMNode } from "@adpt/dom-parser";
import { Constructor } from "@adpt/utils";
import * as ld from "lodash";
import * as util from "util";
import { InternalError } from "../error";
import { HandleInternal, HandleObj, isHandleInternal, isHandleObj } from "../handle";
import {
    AdaptElement,
    AdaptElementOrNull,
    AnyProps,
    AnyState,
    childrenToArray,
    ClassComponentTyp,
    createElement,
    isElementImpl,
    KeyPath,
} from "../jsx";
import { DeployOpID } from "../server/deployment_data";
import { reanimateUrn } from "./reanimate";

type KeyPathJson = string;

interface HandleReg {
    handles: HandleInternal[];
    nodes: Map<KeyPathJson, AdaptElement>;
}

export async function reanimateDom(xmlString: string, deployID: string,
    deployOpID: DeployOpID): Promise<AdaptElementOrNull> {

    const domNodesRoot = await domFromString(xmlString);
    if (domNodesRoot === null) return null;

    const handleReg = {
        handles: [],
        nodes: new Map<string, AdaptElement>(),
    };

    const dom = await reanimateNode(domNodesRoot, [], handleReg, deployID, deployOpID);
    resolveHandles(handleReg);
    return dom;
}

function updateLifecycle(domNode: DOMNode, elem: AdaptElement, deployID: string,
    deployOpID: DeployOpID): void {

    if (!domNode.lifecycleInfo) return;
    if (!isElementImpl(elem)) throw new InternalError("Element is not ElementImpl");
    const info = domNode.lifecycleInfo;
    if (elem.props.key !== ld.last(info.stateNamespace)) {
        throw new Error(`Invalid DOM XML. Element key does not match stateNamespace: ${util.inspect(domNode)}`);
    }
    elem.mount(
        domNode.lifecycleInfo.stateNamespace.slice(0, -1),
        domNode.lifecycleInfo.path,
        domNode.lifecycleInfo.keyPath,
        deployID,
        deployOpID,
        );
    elem.reanimated = true;
}

async function makeHandle(val: HandleObj, handleReg: HandleReg): Promise<unknown> {
    const ctor: Constructor<any> = await reanimateUrn(val.urn);
    const handle = new ctor(val);
    if (isHandleInternal(handle) && handle.unresolvedTarget !== null) {
        handleReg.handles.push(handle);
    }
    return handle;
}

//val must be a pod, prototpyes are not preserved
async function convertHandles(val: any, handleReg: HandleReg): Promise<unknown> {
    if (!(ld.isObject(val) || ld.isArray(val))) return val;
    if (ld.isObject(val) && isHandleObj(val)) return makeHandle(val, handleReg);
    if (ld.isArray(val)) {
        const retP = val.map(async (v) => convertHandles(v, handleReg));
        const ret = Promise.all(retP);
        return ret;
    }
    if (ld.isObject(val)) {
        const ret: any = {};
        for (const key of Object.keys(val)) {
            ret[key] = await convertHandles(val[key], handleReg);
        }
        return ret;
    }
    throw new InternalError(`should be unreachable: ${util.inspect(val)}`);
}

async function reanimateNode(
    domNode: DOMNode,
    parentPath: KeyPath,
    handleReg: HandleReg,
    deployID: string,
    deployOpID: DeployOpID,
): Promise<AdaptElement> {

    const nodeKey = domNode.props.key;
    if (typeof nodeKey !== "string") throw new Error(`Invalid DOM XML. Element with no key: ${util.inspect(domNode)}`);

    const keyPath = parentPath.concat([nodeKey]);
    const component: ClassComponentTyp<AnyProps, AnyState> =
        await reanimateUrn(domNode.uri);

    const pChildren = childrenToArray(domNode.props.children).map(async (c) => {
        if (!isDOMNode(c)) return convertHandles(c, handleReg);
        return reanimateNode(c, keyPath, handleReg, deployID, deployOpID);
    });
    const children: any[] = await Promise.all(pChildren);

    // Reanimate any DOMObjects
    const props: AnyProps = {};
    for (const k of Object.keys(domNode.props)) {
        if (k === "children") continue;
        props[k] = await convertHandles(domNode.props[k], handleReg);
    }

    const node = createElement(component, props, ...children);
    updateLifecycle(domNode, node, deployID, deployOpID);

    handleReg.nodes.set(JSON.stringify(keyPath), node);

    return node;
}

function resolveHandles(handleReg: HandleReg) {
    for (const hand of handleReg.handles) {
        const target = hand.unresolvedTarget;
        if (target == null) throw new InternalError(`target is null`);
        const node = handleReg.nodes.get(JSON.stringify(target));
        if (node == null) throw new Error(`DOM reanimation error: cannot find DOM node path '${target}'`);

        hand.associate(node);
    }
}
