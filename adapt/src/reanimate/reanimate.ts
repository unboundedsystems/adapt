import { createPackageRegistry } from "@usys/utils";
import callsites = require("callsites");
import stringify from "json-stable-stringify";
import * as path from "path";
import URN = require("urn-lib");
import { inspect } from "util";
import { InternalError } from "../error";
import { findPackageInfo } from "../packageinfo";

// As long as utilsTypes is not used as a value, TS will only pull in the
// types. Then dynamically load utils, if available. Since we use this file
// as a module in unit tests, the dynamic import allows us to not have to
// load all the dependencies that utils needs, thus speeding up tests.
import * as utilsTypes from "../utils";
let trace: typeof utilsTypes.trace;
try {
    // tslint:disable-next-line:no-var-requires
    const utilsMod: typeof utilsTypes = require("../utils");
    trace = utilsMod.trace;
} catch {
    // No tracing if utils is unavailable (e.g. in certain unit tests).
    trace = () => undefined;
}

const debugReanimate = false;

export type MummyJson = string;
export type MummyUrn = string;

type PackageId = string;

// Exported for testing only
export class MummyRegistry {
    jsonToObj = new Map<MummyJson, any>();
    objToJson = new Map<any, MummyJson>();
    packageRegistry = createPackageRegistry(".");

    async awaken(mummyJson: MummyJson): Promise<any> {
        let obj = this.jsonToObj.get(mummyJson);
        if (obj !== undefined) return obj;

        const mummy = JSON.parse(mummyJson);
        if (!isMummy(mummy)) throw new Error(`Invalid mummy JSON`);

        let pkgPath = await this.packageRegistry.findPath(mummy.pkgName, mummy.pkgVersion);
        if (pkgPath == null) {
            // We can't find an EXACT match for the package ID from mummy
            // (package name and exact version). This typically happens for
            // two reasons: 1) The version of the package in question has
            // changed (e.g. updated to newer version) or 2) the package
            // is located in a node search path, but is not in the node_modules
            // directory for THIS package (e.g. it's in a parent node_modules
            // directory like happens in the adapt repo).
            // Both of these things could be fixed by webpacking/zipping the
            // current Adapt project and all dependencies.
            trace(debugReanimate, `WARN: Unable to find package ${packageId(mummy)} in module tree`);
            pkgPath = mummy.pkgName;
        }

        let mainFile;
        try {
            mainFile = require.resolve(pkgPath);
        } catch (err) {
            throw new Error(
                `Unable to locate installed package ${mummy.pkgName} version ` +
                `${mummy.pkgVersion})}`);
        }
        const modPath = path.join(path.dirname(mainFile), mummy.relFilePath);

        // This should cause the module to initialize and call registerObject.
        const exp = require(modPath);

        // Try the lookup again
        obj = this.jsonToObj.get(mummyJson);
        if (obj !== undefined) return obj;

        // We get here if the call to registerObject is not done at the top
        // level module scope. We can still find the object we're looking for
        // as long as it gets exported and that export happens at the top
        // level module scope.
        trace(debugReanimate, `\n****  Searching exports for:`, mummy, `\nExports:`, exp);
        this.print();

        let parent: any = exp;
        if (mummy.namespace !== "") parent = parent && parent[mummy.namespace];
        obj = parent && parent[mummy.name];
        trace(debugReanimate, `Exports lookup returned:`, obj);

        // NOTE(mark): I think we can remove namespace, as long as this error
        // never triggers.
        if (mummy.namespace !== "" && obj != null) {
            throw new Error(`**** Used non-default namespace to successfully find ${mummyJson}`);
        }

        if (obj === undefined) {
            throw new Error(`Unable to reanimate ${mummyJson}`);
        }
        this.entomb(obj, mummyJson);
        return obj;
    }

    findMummy(obj: any): MummyJson {
        if (obj == null) throw new Error(`Can't get JSON representation of ${obj}`);
        const mj = this.objToJson.get(obj);
        if (mj !== undefined) return mj;
        throw new Error(`Unable to look up JSON representation for '${obj}'`);
    }

    entomb(obj: any, mummyJson: MummyJson) {
        if (obj == null) {
            throw new Error(`Unable to store ${obj} for later reanimation`);
        }
        this.jsonToObj.set(mummyJson, obj);
        const existing = this.objToJson.get(obj);
        if (existing !== undefined && existing !== mummyJson) {
            trace(debugReanimate, `WARN: reanimate: object '${obj}' already stored`);
            trace(debugReanimate, `Existing:`, existing, `New:`, mummyJson);
        } else {
            this.objToJson.set(obj, mummyJson);
        }
    }

    print() {
        if (!debugReanimate) return;
        trace(debugReanimate, "Registry - jsonToObj:");
        this.jsonToObj.forEach((key, val) => {
            trace(debugReanimate, `  ${key} -> ${val}`);
        });

        trace(debugReanimate, "\nRegistry - objToJson:");
        this.objToJson.forEach((key, val) => {
            trace(debugReanimate, `  ${key} -> ${val}`);
        });
    }
}

let registry = new MummyRegistry();

function resetRegistry() {
    registry = new MummyRegistry();
}

interface Mummy {
    name: string;
    namespace: string;
    pkgName: string;
    pkgVersion: string;
    relFilePath: string;
}
const mummyProps = ["name", "namespace", "pkgName", "pkgVersion", "relFilePath"];

function isMummy(val: any): val is Mummy {
    if (val == null || typeof val !== "object") {
        throw new Error(`Invalid represenation of object`);
    }
    for (const prop of mummyProps) {
        const t = typeof val[prop];
        if (t !== "string") {
            throw new Error(`Invalid property '${prop}' type '${t}' in representation of object`);
        }
    }
    return true;
}

function enbalm(obj: any, name: string, namespace: string, module: NodeModule): MummyJson {
    const pkgInfo = findPackageInfo(path.dirname(module.filename));
    const m: Mummy = {
        name,
        namespace,
        pkgName: pkgInfo.name,
        pkgVersion: pkgInfo.version,
        relFilePath: path.relative(path.dirname(pkgInfo.main), module.filename),
    };
    trace(debugReanimate, "mainFile:", pkgInfo.main, "\nmummy:", m);
    const s = stringify(m);
    trace(debugReanimate, "JSON value:", s);
    return s;
}

export function registerObject(obj: any, name: string,
                               modOrCallerNum: NodeModule | number = 0,
                               altNamespace = "$adaptExports") {
    if (obj == null) throw new Error(`Cannot register null or undefined`);

    const mod = findModule(modOrCallerNum);
    if (mod.exports == null) {
        throw new InternalError(`exports unexpectedly null for ` +
            `${mod.id}\n${inspect(mod)}`);
    }

    // FIXME(mark): we should wait to run findExportName until
    // module.loaded === true. To do that, we should create a Promise, but
    // store it rather than returning it, to keep this function sync. Then
    // both reanimate and findMummy should ensure all promises are resolved before
    // continuing operation. That should allow us to remove the namespace
    // stuff.
    const exportName = findExportName(obj, name, mod);

    registry.entomb(obj, enbalm(obj, exportName || name,
                                exportName ? "" : altNamespace, mod));

    if (!exportName) {
        let exp = mod.exports[altNamespace];
        if (exp == null) {
            exp = Object.create(null);
            mod.exports[altNamespace] = exp;
        }
        exp[name] = obj;
    }
}

// tslint:disable-next-line:ban-types
export function registerConstructor(ctor: Function) {
    registerObject(ctor, ctor.name, findConstructorModule(ctor.name));
}

function findExportName(obj: any, defaultName: string,
                        module: NodeModule): string | undefined {
    // Try preferred first, in case this obj is exported under multiple
    // names.
    if (module.exports[defaultName] === obj) return defaultName;

    // obj is not exported as that name
    for (const k of Object.keys(module.exports)) {
        if (module.exports[k] === obj) return k;
    }
    return undefined;
}

function findModule(modOrCallerNum: NodeModule | number): NodeModule {
    let mod: NodeModule;

    if (typeof modOrCallerNum === "number") {
        if (modOrCallerNum < 0) {
            throw new Error(`registerObject: callerNum must be >= 0`);
        }
        // Back up the stack to caller of registerObject
        mod = callerModule(modOrCallerNum + 3);
    } else {
        mod = modOrCallerNum;
    }

    return mod;
}

// Exported for testing
export function findConstructorModule(ctorName: string): NodeModule {
    const stack = callsites();
    let candidateFrame: number | undefined;

    // Skip over first entry..that's this function
    let frame = 1;

    // Find the first frame inside a constructor
    while (frame < stack.length) {
        if (stack[frame].isConstructor()) break;
        frame++;
    }
    if (frame === stack.length) throw new Error(`Unable to find constructor on stack`);

    // getTypeName for the first constructor frame appears to be one of the
    // few frames that has a non-null this type name. Use as a double check.
    const thisType = stack[frame].getTypeName();
    if (typeof thisType !== "string") {
        throw new Error(`Uncertain about constructor stack frame structure for ${ctorName}`);
    }

    let lastConstructor = frame;
    while (frame < stack.length) {
        // Stop when we reach a frame not inside a constructor
        if (!stack[frame].isConstructor()) break;
        lastConstructor = frame;

        if (stack[frame].getFunctionName() === ctorName) {
            if (candidateFrame !== undefined) {
                throw new Error(`Found two candidate constructor frames`);
            }
            candidateFrame = frame;
        }
        frame++;
    }
    if (candidateFrame === undefined) {
        throw new Error(
            `Unable to find constructor with correct name. Outer ` +
            `constructor is: ${stack[lastConstructor].getFunctionName()}`);
    }

    const filename = stack[candidateFrame].getFileName();
    if (!filename) throw new Error(`stack frame has no filename`);

    const mod = require.cache[filename];
    if (!mod) throw new Error(`Unable to find module for file ${filename}`);

    return mod;
}

// Exported for testing
export function callerModule(callerNum: number): NodeModule {
    if (!Number.isInteger(callerNum) || callerNum < 0) {
        throw new Error(`callerModule: invalid callerNum: ${callerNum}`);
    }
    const stack = callsites();
    if (callerNum >= stack.length) {
        throw new Error(`callerModule: callerNum too large: ${callerNum}, max: ${stack.length - 1}`);
    }

    const fileName = stack[callerNum].getFileName();
    if (fileName == null) {
        throw new Error(`callerModule: unable to get filename`);
    }

    const mod = require.cache[fileName];
    if (mod == null) {
        throw new Error(`callerModule: file ${fileName} not in cache`);
    }
    return mod;
}

export function reanimate(mummy: MummyJson): Promise<any> {
    return registry.awaken(mummy);
}

export function findMummy(obj: any): MummyJson {
    return registry.findMummy(obj);
}

// Exported for testing
export function mockRegistry_(newRegistry?: MummyRegistry | null): MummyRegistry {
    const oldRegistry = registry;

    if (newRegistry === null) resetRegistry();
    else if (newRegistry !== undefined) registry = newRegistry;

    return oldRegistry;
}

/*
 * URNs
 */

const urnDomain = "Adapt";
const encoder = URN.create("urn", {
    components: [
        "domain",
        "pkgName",
        "pkgVersion",
        "namespace",
        "relFilePath",
        "name",
    ],
    separator: ":",
    allowEmpty: true,
});

export function findMummyUrn(obj: any): MummyUrn {
    const mummyJson = registry.findMummy(obj);
    const mummy: Mummy = JSON.parse(mummyJson);
    return encoder.format({ domain: urnDomain, ...mummy });
}

export function reanimateUrn(mummyUrn: MummyUrn): Promise<any> {
    const parsedUrn = encoder.parse(mummyUrn);
    if (parsedUrn == null) throw new Error(`Cannot reanimate urn: "${mummyUrn}"`);
    const { domain, protocol, ...mummy } = parsedUrn;
    if (protocol !== "urn") {
        throw new Error(`Invalid protocol in URN '${mummyUrn}'`);
    }
    if (domain !== urnDomain) {
        throw new Error(`Invalid domain in URN '${mummyUrn}'`);
    }

    if (!isMummy(mummy)) throw new InternalError(`isMummy returned false`);
    return registry.awaken(stringify(mummy));
}

function packageId(pkg: Mummy): PackageId {
    return `${pkg.pkgName}@${pkg.pkgVersion}`;
}
