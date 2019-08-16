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

import { findPackageDirs } from "@adpt/utils";
import * as path from "path";
import * as vm from "vm";
// tslint:disable-next-line:variable-name no-var-requires
const Module = require("module");

import * as ld from "lodash";
import {
    InternalError,
    isError,
    ProjectCompileError,
    ProjectRunError,
    ThrewNonError
} from "../error";
import { trace, tracef } from "../utils";
import { CompileError } from "./compile";
import { ChainableHost } from "./hosts";

const builtInModules = new Set<string>(Module.builtinModules);

const debugVm = false;

const packageDirs = findPackageDirs(__dirname);

// Remove each line that has a filename that's in our dist/src/ts directory
// or our src/ts directory (depending on how the module is installed).
// There are often 2-3 of these compilation-related frames between each
// stack frame that the user cares about, which makes the backtraces super
// confusing for them.
const tsStackExclude = RegExp("\n.*?\\(" + packageDirs.root + "(?:/dist)?/src/ts/.*?$", "mg");

// Script.runInContext is the call that starts the user's project script.
// Delete that line and all following lines.
const ctxStackEnd = /\n[^\n]*Script\.runInContext(?:.|\n)*/;

function getProjectStack(projectError: Error): string {
    if (projectError.stack) {
        let ctxStack = projectError.stack.replace(ctxStackEnd, "");
        ctxStack = ctxStack.replace(tsStackExclude, "");
        return ctxStack;
    }
    return "[No stack]";
}

export interface Extensions {
    [ext: string]: any;
}

export interface RequireCache {
    [abspath: string]: NodeModule;
}

interface Modules {
    [abspath: string]: VmModule;
}

function isRelative(loc: string) {
    return loc.startsWith("./") || loc.startsWith("../");
}

export class VmModule {
    extensions: Extensions;
    requireCache: RequireCache;
    _compile = this.runJs;
    ctxModule: NodeModule;
    vmModules: Modules;
    private hostModCache: any;

    constructor(public id: string, private vmContext: vm.Context | undefined,
        public host: ChainableHost,
        public parent?: VmModule) {
        if (parent) {
            this.extensions = parent.extensions;
            this.requireCache = parent.requireCache;
            this.hostModCache = parent.hostModCache;
            this.vmModules = parent.vmModules;
        } else {
            this.extensions = Object.create(null);
            this.requireCache = Object.create(null);
            this.hostModCache = Object.create(null);
            this.vmModules = Object.create(null);
            this.extensions[".js"] = this.runJsModule.bind(this);
            this.extensions[".json"] = this.runJsonModule.bind(this);
        }
        this.ctxModule = new Module(id, (parent && parent.ctxModule) || null);
        this.ctxModule.filename = id;
    }

    /**
     * Init that happens only once per VmContext, after the context's VM has
     * been created. This should be called on the "main" module for the context
     * ONLY.
     * @param ctx The vm context where the DOM code will run.
     */
    initMain(ctx: vm.Context) {
        if (this.parent) throw new InternalError(`initMain should only be called on top-level VmModule`);

        this.vmContext = ctx;

        // NOTE(mark): There's some strange behavior with allowing this
        // module to be re-loaded in the context when used alongside
        // source-map-support in unit tests. Even though callsites overrides
        // Error.prepareStackTrace with its own function, that function
        // never gets called. If you figure out why, remove this.
        this.loadHostMod("callsites");
    }

    @tracef(debugVm)
    requireResolve(request: string, options?: { paths?: string[] }) {
        if (options) {
            throw new Error("require.resolve options not supported yet.");
        }
        const resolved = this.host.resolveModuleName(request, this.id, true);
        if (resolved) return resolved.resolvedFileName;

        if (isRelative(request)) request = path.join(path.dirname(this.id), request);
        if (!path.isAbsolute(request)) {
            // mimic Node's error for this case.
            const err = new Error(`Cannot find module '${request}'`);
            (err as any).code = "MODULE_NOT_FOUND";
            throw err;
        }
        return require.resolve(request, options);
    }

    @tracef(debugVm)
    require(modName: string) {
        let hostMod = this.requireHostMod(modName);
        if (hostMod !== undefined) return hostMod;

        if (builtInModules.has(modName)) {
            hostMod = this.requireBuiltin(modName);
            if (hostMod === undefined) throw new InternalError(`Cannot find module '${modName}'`);
            return hostMod;
        }

        let resolved: string | undefined;
        try {
            resolved = this.requireResolve(modName);
        } catch (e) {
            if (!ld.isError(e)) throw e;
            if (!e.message.startsWith("Cannot find")) throw e;
        }

        if (resolved) {
            const resolvedPath = resolved;

            const cached = this.requireCache[resolvedPath];
            if (cached) return cached.exports;

            const newMod = new VmModule(resolvedPath, this.vmContext, this.host,
                this);

            this.vmModules[resolvedPath] = newMod;
            this.requireCache[resolvedPath] = newMod.ctxModule;

            const ext = path.extname(resolvedPath) || ".js";

            // Run the module
            this.extensions[ext](newMod, resolvedPath);

            newMod.ctxModule.loaded = true;
            return newMod.ctxModule.exports;
        }

        throw new Error(`Unable to find module ${modName} ` +
            `imported from ${this.id}`);
    }

    @tracef(debugVm)
    registerExt(ext: string, func: (mod: VmModule, fileName: string) => void) {
        this.extensions[ext] = func;
    }

    private loadHostMod(modName: string) {
        const cached = this.hostModCache[modName];
        if (cached !== undefined) return cached;

        const mod = require(modName);
        this.hostModCache[modName] = mod;

        return mod;
    }

    @tracef(debugVm)
    private requireHostMod(modName: string) {
        return this.hostModCache[modName];
    }

    @tracef(debugVm)
    private requireBuiltin(modName: string) {
        try {
            return this.loadHostMod(modName);
        } catch (e) {
            if (e.code === "MODULE_NOT_FOUND") return undefined;
            throw e;
        }
    }

    @tracef(debugVm)
    private runJsonModule(mod: VmModule, filename: string) {
        const contents = this.host.readFile(filename);
        if (contents == null) {
            throw new Error(`Unable to find file contents for ${filename}`);
        }
        try {
            mod.ctxModule.exports = JSON.parse(contents);
        } catch (err) {
            err.message = filename + ": " + err.message;
            throw err;
        }
    }

    @tracef(debugVm)
    private runJsModule(mod: VmModule, filename: string) {
        const contents = this.host.readFile(filename);
        if (contents == null) {
            throw new Error(`Unable to find file contents for ${filename}`);
        }
        return mod.runJs(contents, filename);
    }

    @tracef(debugVm)
    private runJs(content: string, filename: string) {
        if (!this.vmContext) throw new Error(`vmContext is not set`);
        const wrapper = Module.wrap(content);
        const compiled = vm.runInContext(wrapper, this.vmContext, { filename });
        const require = (() => {
            const ret: NodeRequire = this.require.bind(this) as NodeRequire;
            ret.resolve = this.requireResolve.bind(this);
            ret.cache = this.requireCache;
            return ret;
        })();
        const dirname = path.dirname(filename);
        try {
            return compiled.call(this.ctxModule.exports, this.ctxModule.exports,
                require, this.ctxModule, filename, dirname);
        } catch (err) {
            if ((err instanceof ProjectRunError) ||
                (err instanceof CompileError)) {
                throw err;
            }
            if (!isError(err)) err = new ThrewNonError(err);
            throw new ProjectRunError(err, getProjectStack(err), err.stack);
        }
    }
}

// Javascript defines a set of properties that should be available on the
// global object. V8 takes care of those. Only add the ones that Node defines.
const hostGlobals = () => ({
    version: parseInt(process.versions.node.split(".")[0], 10),
    process,
    console,
    setTimeout,
    setInterval,
    setImmediate,
    clearTimeout,
    clearInterval,
    clearImmediate,
    Buffer,
});

/*
 * Prepares a context object to be the global object within a new
 * V8 context.
 */
export class VmContext {
    mainModule: VmModule;

    constructor(public vmGlobal: any, dirname: string, public filename: string,
        public host: ChainableHost) {

        vmGlobal.__filename = filename;
        vmGlobal.__dirname = dirname;

        const module = new VmModule(filename, undefined, host, undefined);
        this.mainModule = module;

        vmGlobal.exports = module.ctxModule.exports;
        vmGlobal.module = module.ctxModule;
        vmGlobal.require = module.require.bind(module);
        vmGlobal.global = vmGlobal;

        const hGlobals = hostGlobals();
        for (const prop of Object.keys(hGlobals)) {
            vmGlobal[prop] = (hGlobals as any)[prop];
        }

        vm.createContext(vmGlobal);
        module.initMain(vmGlobal);
    }

    @tracef(debugVm)
    run(jsText: string): any {
        let val;
        try {
            // Execute the program
            val = vm.runInContext(jsText, this.vmGlobal, { filename: this.filename });
        } catch (err) {
            // Translate internal error that has all the diags in it
            // to an external API text-only version.
            if (err instanceof CompileError) {
                err = new ProjectCompileError(err.message);
            }
            if (!isError(err)) err = new ThrewNonError(err);
            if (!(err instanceof ProjectRunError)) {
                err = new ProjectRunError(err, getProjectStack(err), err.stack);
            }
            throw err;
        }

        if (debugVm) {
            trace(debugVm, `RESULT: ${JSON.stringify(val, null, 2)}`);
        }
        return val;
    }
}
