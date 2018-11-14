import * as stream from "stream";
import * as util from "util";

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
    if (xmlNode.$$ == null)  new Error("body missing");
    if (!ld.isArray(xmlNode.$$)) throw new Error("Internal Error");
    if (xmlNode.$$.length > 1) throw new Error("too many children");
    if (xmlNode.$$.length === 0) throw new Error("node has no body");

    const child = xmlNode.$$[0];
    const uri = uriOf(child);
    if (!uri.startsWith("urn:")) throw new Error("child has bad xmlns");
    const json = extractSoleText(child);
    return new DOMObject(uri, JSON.parse(json));
}

function handleJSON(xmlNode: XMLNode): object {
    if (nameOf(xmlNode) !== "json") {
        throw new Error("Internal Error: Request to handle json node for non-json: " +
            util.inspect(xmlNode));
    }

    let txt = "";
    try {
        txt = extractSoleText(xmlNode);
        return JSON.parse(txt);
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
        return JSON.parse(extractSoleText(prop));
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

function buildFromXMLNode(xmlNode: XMLNode): DOMNode {
    const name = nameOf(xmlNode);
    const uri = uriOf(xmlNode);
    const props = computeProps(xmlNode);
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

    return new DOMNode(name, props, uri, children);
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
        buf.on("close", () => res(buf.getContentsAsString()));
        buf.on("error", (e) => rej(e));
    });
}

export async function domFromStream(ins: stream.Readable) {
    const xmlStr = await stringFromStream(ins);
    return domFromString(xmlStr);
}
