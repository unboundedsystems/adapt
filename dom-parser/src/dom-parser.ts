/*
 * Copyright 2018-2019 Unbounded Systems, LLC
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

import * as stream from "stream";
import * as util from "util";

import { parseJson5 } from "@adpt/utils";
import * as ld from "lodash";
import * as sb from "stream-buffers";
import * as xml2js from "xml2js";

import {
    AnyProps,
    DOMNode,
    DOMObject,
} from "./dom";

const rootName = "Adapt";

async function parseXML(xmlStr: string): Promise<any> {
    return new Promise<any>((res, rej) => {
        xml2js.parseString(xmlStr, {
            explicitRoot: false,
            explicitChildren: true,
            preserveChildrenOrder: true,
            charsAsChildren: true,
            xmlns: true,
        }, (err, result) => {
            if (err != null) rej(err);
            else res(result);
        });
    });
}

export type XMLNode = GenericXMLNode | XMLPropsNode | XMLPropNode | XMLTextNode;
export interface GenericXMLNode {
    "#name": string;
    "$"?: Attrs;
    "$$"?: XMLNode[];
    "$ns"?: XMLNS;
}

export interface XMLPropsNode extends GenericXMLNode {
    "#name": "__props__";
    "$$"?: XMLPropNode[];
}

export interface XMLPropNode extends GenericXMLNode {
    "#name": "prop";
    "$$": XMLTextNode[];
}

export interface XMLLifecycleNode extends GenericXMLNode {
    "#name": "__lifecycle__";
    "$$"?: XMLLifecycleFieldNode[];
}

export interface XMLLifecycleFieldNode extends GenericXMLNode {
    "#name": "field";
    "$$": XMLTextNode[];
}

export interface XMLTextNode extends GenericXMLNode {
    "#name": "__text__";
    "_": string;
}

export interface XMLNS {
    local: string;
    uri: string;
}

export interface Attr {
    local: string;
    name: string;
    prefix: string;
    uri: string;
    value: any;
}

export interface Attrs {
    [key: string]: Attr;
}

function nameOf(xmlNode: XMLNode): string {
    if (xmlNode.$ns) return xmlNode.$ns.local;
    return xmlNode["#name"];
}

function uriOf(xmlNode: XMLNode): string {
    if (xmlNode.$ns) return xmlNode.$ns.uri;
    return "";
}

export function handleShortProp(val: string): string | number {
    if (/^\d/.test(val)) {
        const ret = Number(val);
        if (isNaN(ret)) {
            throw new Error("invalid short prop value \"" + val + "\"");
        }
        return ret;
    } else {
        return val;
    }
}

function isTextNode(xmlNode: XMLNode): xmlNode is XMLTextNode {
    return xmlNode["#name"] === "__text__";
}

function extractSoleText(xmlNode: XMLNode) {
    if (xmlNode.$$ == null) {
        throw new Error("body missing");
    }

    if (!ld.isArray(xmlNode.$$)) {
        throw new Error("Internal Error");
    }

    if (xmlNode.$$.length > 1) {
        throw new Error("too many children");
    }

    if (xmlNode.$$.length === 0) {
        throw new Error("node has no body");
    }

    const child = xmlNode.$$[0];
    if (isTextNode(child)) {
        return child._;
    } else {
        throw new Error("no text node found");
    }
}

function extractDOMObject(xmlNode: XMLNode): DOMObject {
    if (xmlNode.$$ == null) new Error("body missing");
    if (!ld.isArray(xmlNode.$$)) throw new Error("Internal Error");
    if (xmlNode.$$.length > 1) throw new Error("too many children");
    if (xmlNode.$$.length === 0) throw new Error("node has no body");

    const child = xmlNode.$$[0];
    const uri = uriOf(child);
    if (!uri.startsWith("urn:")) throw new Error("child has bad xmlns");
    const json = extractSoleText(child);
    return new DOMObject(uri, parseJson5(json));
}

function handleJSON(xmlNode: XMLNode): object {
    if (nameOf(xmlNode) !== "json") {
        throw new Error("Internal Error: Request to handle json node for non-json: " +
            util.inspect(xmlNode));
    }

    let txt = "";
    try {
        txt = extractSoleText(xmlNode);
        return parseJson5(txt);
    } catch (e) {
        throw new Error("malformed json node body: " + e.message);
    }
}

function getPropsNode(xmlNode: XMLNode): XMLPropsNode[] {
    const anode = xmlNode as any;
    if (anode.__props__ != null) {
        return anode.__props__;
    }
    return [];
}

function extractProp(prop: XMLPropNode): any {
    try {
        return parseJson5(extractSoleText(prop));
    } catch (err) { /* */ }

    return extractDOMObject(prop);
}

function computeProps(xmlNodeIn: XMLNode): AnyProps {
    const ret: AnyProps = {};
    const xmlNode = xmlNodeIn as GenericXMLNode;

    if (xmlNode.$ != null) {
        for (const prop in xmlNode.$) {
            if (prop === "xmlns" || prop.startsWith("xmlns:")) continue;
            if (!Object.prototype.hasOwnProperty.apply(xmlNode.$, [prop])) continue;
            ret[prop] = handleShortProp(xmlNode.$[prop].value);
        }
    }

    const propsNodes = getPropsNode(xmlNode);
    if (propsNodes.length > 1) {
        throw new Error("malformed node, multiple __props__ children");
    }
    if (propsNodes.length < 1) {
        return ret;
    }

    const propsNode = propsNodes[0];
    if (propsNode.$$ != null) {
        for (const prop of propsNode.$$) {
            if (prop.$ != null) {
                const name = prop.$.name.value;
                if (ret[name] != null) throw new Error("duplicate prop: " + name);
                try {
                    ret[name] = extractProp(prop);
                } catch (e) {
                    throw new Error("malformed prop node for " + name + ": " + e.message);
                }
            }
        }
    }

    return ret;
}

export interface LifecycleInfo {
    stateNamespace: string[];
    keyPath: string[];
    path: string;
}

function getLifecycleNode(xmlNode: XMLNode): XMLLifecycleNode[] {
    const anode = xmlNode as any;
    if (anode.__lifecycle__ != null) {
        return anode.__lifecycle__;
    }
    return [];
}

function extractStringArray(xmlNode: XMLNode): string[] {
    const dataJson = extractSoleText(xmlNode);
    if (dataJson == null) throw new Error(`No text data in node: ${util.inspect(xmlNode)}`);
    const data = parseJson5(dataJson);
    if (!util.isArray(data)) throw new Error(`text data is not an array, expecting string[]: ${util.inspect(xmlNode)}`);
    const notString = data.find((v) => !util.isString(v));
    if (notString !== undefined) {
        throw new Error(`${util.inspect(notString)} is not string, expecting string[]:` + util.inspect(xmlNode));
    }
    return data as string[];
}

function extractString(xmlNode: XMLNode): string {
    const dataJson = extractSoleText(xmlNode);
    if (dataJson == null) throw new Error(`No text data in node: ${util.inspect(xmlNode)}`);
    const data = parseJson5(dataJson);
    if (!util.isString(data)) throw new Error(`text data is not a string: ${util.inspect(xmlNode)}`);
    return data;
}

function augmentError<T>(msg: string, f: () => T): T {
    try {
        return f();
    } catch (e) {
        throw new Error(msg + ":" + e.message);
    }
}

function computeLifecycleInfo(xmlNode: XMLNode): LifecycleInfo | undefined {
    const lifecycleNodes = getLifecycleNode(xmlNode);
    if (lifecycleNodes.length > 1) {
        throw new Error(`malformed ndoe, multiple __lifecycle__ children: ${util.inspect(xmlNode)}`);
    }
    if (lifecycleNodes.length < 1) return;
    const lifecycleNode = lifecycleNodes[0];
    if (lifecycleNode.$$ == null) return;
    const ret: Partial<LifecycleInfo> = {};
    for (const field of lifecycleNode.$$) {
        if (field.$ == null) {
            throw new Error(`malformed node, lifecycle field with no name ${util.inspect(lifecycleNode)}`);
        }
        const fieldName = field.$.name.value;
        switch (fieldName) {
            case "stateNamespace":
                ret.stateNamespace = augmentError("extracting stateNamespace", () => extractStringArray(field));
                break;
            case "keyPath":
                ret.keyPath = augmentError("extracting keyPath", () => extractStringArray(field));
                break;
            case "path":
                ret.path = augmentError("extracting path", () => extractString(field));
                break;
            default:
                throw new Error(`malformed node, ` +
                    `uknown lifecycle field name "${fieldName}": ${util.inspect(lifecycleNode)}`);
        }
    }

    const nodeInfo = util.inspect(xmlNode);
    if (ret.stateNamespace === undefined) throw new Error(`no stateNamespace in lifecycle data: ${nodeInfo}`);
    if (ret.keyPath === undefined) throw new Error (`no keyPath in lifecycle data: ${nodeInfo}`);
    if (ret.path === undefined) throw new Error (`no path in lifecycle data: ${nodeInfo}`);

    return ret as LifecycleInfo;
}

function buildFromXMLNode(xmlNode: XMLNode): DOMNode {
    const name = nameOf(xmlNode);
    const uri = uriOf(xmlNode);
    const props = computeProps(xmlNode);
    const lifecycle = computeLifecycleInfo(xmlNode);
    const children: any[] = [];
    if (xmlNode.$$ != null) {
        if (ld.isArray(xmlNode.$$)) {
            for (const child of xmlNode.$$) {
                if (ld.isObject(child)) {
                    if (nameOf(child) === "__props__") {
                        continue;
                    } else if (nameOf(child) === "__lifecycle__") {
                        continue;
                    } else if (nameOf(child) === "json") {
                        children.push(handleJSON(child));
                    } else {
                        children.push(buildFromXMLNode(child));
                    }
                } else {
                    children.push(child);
                }
            }
        } else {
            throw new Error("Internal parse error");
        }
    }

    return new DOMNode(name, props, lifecycle, uri, children);
}

export async function domFromXMLObj(xmlObj: XMLNode) {
    if (nameOf(xmlObj) !== rootName) {
        throw new Error("Unknown root node: " + nameOf(xmlObj));
    }

    const topLevel = xmlObj.$$;
    if (topLevel == null) {
        return null;
    }

    if (!ld.isArray(topLevel)) {
        throw new Error("Internal error parsing DOM");
    }

    if (topLevel.length === 0) {
        return null;
    }

    if (topLevel.length > 1) {
        throw new Error("Too many elements at root, must have single DOM Node");
    }

    //console.log(util.inspect(xmlObj));
    return buildFromXMLNode(topLevel[0]);
}

export async function domFromString(xmlStr: string) {
    const xmlObj: XMLNode | null = await parseXML(xmlStr);
    if (xmlObj == null) throw new Error(`Invalid empty XML`);
    return domFromXMLObj(xmlObj);
}

async function stringFromStream(ins: stream.Readable): Promise<string> {
    return new Promise<string>((res, rej) => {
        const buf = new sb.WritableStreamBuffer();
        ins.pipe(buf);
        buf.on("close", () => res(buf.getContentsAsString() || undefined));
        buf.on("error", (e) => rej(e));
    });
}

export async function domFromStream(ins: stream.Readable) {
    const xmlStr = await stringFromStream(ins);
    return domFromString(xmlStr);
}
