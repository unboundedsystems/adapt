import { findPackageDirs } from "@usys/utils";
import * as path from "path";
import * as vm from "vm";
// tslint:disable-next-line:variable-name no-var-requires
const Module = require("module");

import { isError, ProjectRunError, ThrewNonError } from "../error";
import { trace, tracef } from "../utils";
import { ChainableHost } from "./hosts";

const debugVm = false;

const packageDirs = findPackageDirs(__dirname);

// Remove each line that has a filename that's in our dist/src/ts directory.
// There are often 2-3 of these compilation-related frames between each
// stack frame that the user cares about, which makes the backtraces super
// confusing for them.
const tsStackExclude = RegExp("^.*\\(" + path.join(packageDirs.dist, "src", "ts") + ".*$", "mg");

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

export interface ModuleCache {
    [abspath: string]: VmModule;
}

export class VmModule {
    _extensions: Extensions;
    _cache: ModuleCache;
    _compile = this.runJs;
    ctxModule: NodeModule;

    private _hostModCache: any;

    constructor(public id: string, private vmContext: vm.Context | undefined,
                public host: ChainableHost,
                public parent?: VmModule) {
        if (parent) {
            this._extensions = parent._extensions;
            this._cache = parent._cache;
            this._hostModCache = parent._hostModCache;
        } else {
            this._extensions = Object.create(null);
            this._cache = Object.create(null);
            this._hostModCache = Object.create(null);
            this._extensions[".js"] = this.runJsModule.bind(this);
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
        this.vmContext = ctx;
        this.loadSelfMod();
    }

    @tracef(debugVm)
    require(modName: string) {
        let hostMod = this.requireHostMod(modName);
        if (hostMod !== undefined) return hostMod;

        const resolved = this.host.resolveModuleName(modName, this.id, true);
        if (resolved) {
            const resolvedPath = resolved.resolvedFileName;

            const cached = this._cache[resolvedPath];
            if (cached) return cached.ctxModule.exports;

            const newMod = new VmModule(resolvedPath, this.vmContext, this.host,
                                        this);

            this._cache[resolvedPath] = newMod;
            require.cache[resolvedPath] = newMod.ctxModule;

            const ext = path.extname(resolvedPath) || ".js";

            // Run the module
            this._extensions[ext](newMod, resolvedPath);

            newMod.ctxModule.loaded = true;
            return newMod.ctxModule.exports;
        }

        // Any relative or absolute path should have been resolved already
        // and should not be resolved by the host system's require.
        if ((modName.charAt(0) !== ".") && !path.isAbsolute(modName)) {
            hostMod = this.requireBuiltin(modName);
            if (hostMod !== undefined) return hostMod;
        }

        throw new Error(`Unable to find module ${modName} ` +
                        `imported from ${this.id}`);
    }

    @tracef(debugVm)
    registerExt(ext: string, func: (mod: VmModule, fileName: string) => void) {
        this._extensions[ext] = func;
    }

    private loadHostMod(modName: string) {
        const cached = this._hostModCache[modName];
        if (cached !== undefined) return cached;

        const mod = require(modName);
        this._hostModCache[modName] = mod;

        return mod;
    }

    private loadSelfMod() {
        this._hostModCache["@usys/adapt"] = require("..");
    }

    @tracef(debugVm)
    private requireHostMod(modName: string) {
        return this._hostModCache[modName];
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
    private runJsModule(mod: VmModule, filename: string) {
        const contents = this.host.readFile(filename);
        if (!contents) {
            throw new Error(`Unable to find file contents for ${filename}`);
        }
        return mod.runJs(contents, filename);
    }

    @tracef(debugVm)
    private runJs(content: string, filename: string) {
        if (!this.vmContext) throw new Error(`vmContext is not set`);
        const wrapper = Module.wrap(content);
        const script = new vm.Script(wrapper, { filename });
        const compiled = script.runInContext(this.vmContext);
        const require = this.require.bind(this);
        const dirname = path.dirname(filename);
        try {
            return compiled.call(this.ctxModule.exports, this.ctxModule.exports,
                                 require, this.ctxModule, filename, dirname);
        } catch (err) {
            if (err instanceof ProjectRunError) throw err;
            if (!isError(err)) err = new ThrewNonError(err);
            throw new ProjectRunError(err, getProjectStack(err), err.stack);
        }
    }

}

const hostGlobals = {
    version: parseInt(process.versions.node.split(".")[0], 10),
    process,
    console,
    setTimeout,
    setInterval,
    setImmediate,
    clearTimeout,
    clearInterval,
    clearImmediate,
    String,
    Number,
    Buffer,
    Boolean,
    Array,
    Date,
    Error,
    RangeError,
    ReferenceError,
    SyntaxError,
    TypeError,
    RegExp,
    Function,
    Object,
    Proxy,
    Reflect,
    Map,
    WeakMap,
    Set,
    WeakSet,
    Promise,
};

let adaptContext: any = Object.create(null);

export function getAdaptContext() {
    return adaptContext;
}

// exported for test only
export function setAdaptContext(ctx: any) {
    adaptContext = ctx;
}

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
        setAdaptContext(Object.create(null));

        for (const prop of Object.keys(hostGlobals)) {
            vmGlobal[prop] = (hostGlobals as any)[prop];
        }

        vm.createContext(vmGlobal);

        module.initMain(vmGlobal);
    }

    @tracef(debugVm)
    run(jsText: string): any {
        let val;
        try {
            const script = new vm.Script(jsText, { filename: this.filename });
            // Execute the program
            val = script.runInContext(this.vmGlobal);
        } catch (err) {
            if (!isError(err)) err = new ThrewNonError(err);
            if (!(err instanceof ProjectRunError)) {
                err = new ProjectRunError(err, getProjectStack(err), err.stack);
            }
            // tslint:disable-next-line:no-console
            console.log(err.message);
            throw err;
        }
        if (debugVm) {
            trace(debugVm, `RESULT: ${JSON.stringify(val, null, 2)}`);
        }
        return val;
    }
}
