import * as path from "path";
import * as vm from "vm";
// tslint:disable-next-line:variable-name no-var-requires
const Module = require("module");

import { trace, tracef } from "../utils";
import { ChainableHost } from "./hosts";

const debugVm = false;

class RunStack {
    stack: string[] = [];
    constructor(public error: Error) {}
}

export interface Extensions {
    [ext: string]: any;
}

export interface ModuleCache {
    [abspath: string]: VmModule;
}

export class VmModule {
    exports: any = {};
    filename: string;
    loaded = false;
    children: VmModule[] = [];
    _extensions: Extensions;
    _cache: ModuleCache;
    _compile = this.runJs;

    private _hostModCache: any;

    constructor(public id: string, private vmContext: vm.Context | undefined,
                public host: ChainableHost,
                public parent?: VmModule) {
        this.filename = id;
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
            if (cached) return cached.exports;

            const newMod = new VmModule(resolvedPath, this.vmContext, this.host,
                                        this);

            this._cache[resolvedPath] = newMod;

            const ext = path.extname(resolvedPath) || ".js";
            // Run the module
            this._extensions[ext](newMod, resolvedPath);
            newMod.loaded = true;
            return newMod.exports;
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
            return compiled.call(this.exports, this.exports, require, this,
                                filename, dirname);
        } catch (err) {
            if (err instanceof RunStack) {
                err.stack.push(filename);
                throw err;
            }
            const rs = new RunStack(err);
            rs.stack.push(filename);
            throw rs;
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

let adaptContext: any;

export function getAdaptContext() {
    return adaptContext;
}

function setAdaptContext(ctx: any) {
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

        vmGlobal.exports = module.exports;
        vmGlobal.module = module;
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
            if (err instanceof RunStack) {
                // tslint:disable-next-line:no-console
                console.log(`Error during run: ${err.error.message}`);
                for (const mod of err.stack) {
                    // tslint:disable-next-line:no-console
                    console.log(`  ${mod}`);
                }
                throw new Error(`Exiting on run error`);
            }
            throw err;
        }
        if (debugVm) {
            trace(debugVm, `RESULT: ${JSON.stringify(val, null, 2)}`);
        }
        return val;
    }
}
