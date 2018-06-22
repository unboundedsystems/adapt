import * as path from "path";
import * as ts from "typescript";
import { trace, tracef } from "../utils";
import { ChainableHost } from "./hosts";

const debugModuleResolution = false;

const dtsRegex = /\.d\.ts$/;

export class ModuleResolver extends ChainableHost {
    private cache: Map<string, ts.ResolvedModuleFull | null>;

    constructor(private compilerOptions: ts.CompilerOptions,
                private moduleDirs: string[], chainHost?: ChainableHost, id?: string) {
        super();
        if (chainHost) this.setSource(chainHost);
        this.cache = new Map<string, ts.ResolvedModuleFull | null>();
        if (id) this._id = id;
    }

    @tracef(debugModuleResolution)
    _resolveModuleNames(moduleNames: string[], containingFile: string,
                        reusedNames?: string[]): ts.ResolvedModule[] {
        const resolved: ts.ResolvedModuleFull[] = [];
        for (const modName of moduleNames) {
            resolved.push(this._resolveModuleName(modName, containingFile, false));
        }
        return resolved;
    }

    /**
     * Resolve a single module name to a file path
     * @param modName The module name, as specified in import/require
     * @param containingFile The path to the file that contains the import
     * @param reusedNames
     */
    @tracef(debugModuleResolution)
    _resolveModuleName(modName: string, containingFile: string, runtime: boolean):
        ts.ResolvedModuleFull {
        trace(debugModuleResolution,
              `Trying to resolve ${modName}`);
        const fn = this.realFilename(containingFile);
        if (!fn) throw new Error(`Unable to get real filename for ${containingFile}`);
        containingFile = fn;
        const cacheKey = `${modName}\0${containingFile}\0${runtime}`;
        let mod = this.cache.get(cacheKey);
        // @ts-ignore
        if (mod !== undefined) return mod === null ? undefined : mod;

        mod = this.resolvePlugin(modName);
        if (!mod) {
            const r = ts.resolveModuleName(modName, containingFile,
                                         this.compilerOptions, this);
            if (r) {
                mod = r.resolvedModule;
                if (mod && mod.resolvedFileName) {
                    // If the resolved name is a fake/translated name by
                    // ModuleExtHost, like 'module.ts' when the actual file
                    // is 'module.dom', get the actual file name.
                    const realFile = this.realFilename(mod.resolvedFileName);
                    if (realFile) mod.resolvedFileName = realFile;
                }
            }

            if (runtime) {
                const resolved = mod && mod.resolvedFileName;
                if (resolved && resolved.match(dtsRegex)) {
                    trace(debugModuleResolution,
                          `Initially resolved to ${resolved}, but rejecting .d.ts ` +
                          `file because runtime=true`);
                    mod = this.resolveJS(modName, containingFile);
                }
            }
        }
        if (mod) {
            trace(debugModuleResolution, `Resolved to ${mod.resolvedFileName}`);
            this.cache.set(cacheKey, mod);
        } else {
            trace(debugModuleResolution, `FAILED to resolve ${modName}`);
            this.cache.set(cacheKey, null);
        }
        // @ts-ignore
        return mod;
    }

    resolvePlugin(modName: string): ts.ResolvedModuleFull | undefined {
        // Plugins are neither relative modules nor absolute paths
        if ((modName.charAt(0) === ".") || path.isAbsolute(modName)) {
            return undefined;
        }

        for (const d of this.moduleDirs) {
            const p = path.join(this.source._getCurrentDirectory(), d, modName);
            const fname = p + ".ts";

            if (this.source._fileExists(fname)) {
                return { resolvedFileName: fname, extension: ts.Extension.Ts };
            }
            if (this.source._directoryExists(p)) {
                const f = path.join(p, "index.dom");
                if (this.source._fileExists(f)) {
                    return { resolvedFileName: f, extension: ts.Extension.Ts };
                }
            }
        }
        return undefined;
    }

    /**
     * Called by TS for module tracing and other debug output
     * @param s String to be printed to debug output stream
     */
    trace(s: string) {
        trace(debugModuleResolution, s);
    }

    private resolveJS(modName: string,
                      containingFile: string): ts.ResolvedModuleFull | null {
        // The function is exported, but marked @internal
        const resolveJS = (ts as any).resolveJavaScriptModule;
        if (!resolveJS) {
            trace(debugModuleResolution,
                `No resolveJavaScriptModule function available`);
            return null;
        }

        const jsFile = resolveJS(modName, path.dirname(containingFile), this);
        if (!jsFile) {
            trace(debugModuleResolution, `JavaScript file resolution failed`);
            return null;
        }

        let ext: ts.Extension;
        switch (path.extname(jsFile)) {
            case ts.Extension.Js:
                ext = ts.Extension.Js;
                break;
            case ts.Extension.Jsx:
                ext = ts.Extension.Jsx;
                break;
            default:
                throw new Error(`Module file extension ` +
                                `'${path.extname(jsFile)}' not understood`);
        }
        return {
            resolvedFileName: jsFile,
            isExternalLibraryImport: true,
            extension: ext,
        };
    }
}
