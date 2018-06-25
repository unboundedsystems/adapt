import * as path from "path";
import * as ts from "typescript";
import { trace, tracef } from "../utils";
import { ChainableHost } from "./hosts";

const debugModuleResolution = false;

const dtsRegex = /\.d\.ts$/;

export class ModuleResolver extends ChainableHost {
    private cache: Map<string, ts.ResolvedModuleFull | null>;

    constructor(private compilerOptions: ts.CompilerOptions,
                chainHost?: ChainableHost, id?: string) {
        super((chainHost && chainHost.cwd) || "/");
        if (chainHost) this.setSource(chainHost);
        this.cache = new Map<string, ts.ResolvedModuleFull | null>();
        if (id) this._id = id;
    }

    @tracef(debugModuleResolution)
    resolveModuleNames(moduleNames: string[], containingFile: string,
                       reusedNames?: string[]) {
        const resolved: ts.ResolvedModuleFull[] = [];
        for (const modName of moduleNames) {
            // NOTE: ts.CompilerHost allows returning undefined for a module, but
            // ts.LanguageServiceHost does not. Fib a little here.
            resolved.push(
                this.resolveModuleName(modName, containingFile,
                                       false) as ts.ResolvedModuleFull);
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
    resolveModuleName(modName: string, containingFile: string, runtime: boolean) {
        trace(debugModuleResolution, `Trying to resolve ${modName}`);
        const fn = this.realFilename(containingFile);
        if (!fn) throw new Error(`Unable to get real filename for ${containingFile}`);
        containingFile = fn;
        const cacheKey = `${modName}\0${containingFile}\0${runtime}`;
        let mod = this.cache.get(cacheKey);

        if (mod !== undefined) return mod === null ? undefined : mod;

        const r = ts.resolveModuleName(modName, containingFile,
                                       this.compilerOptions, this);
        if (r) {
            mod = r.resolvedModule;

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
            return mod;
        }

        trace(debugModuleResolution, `FAILED to resolve ${modName}`);
        this.cache.set(cacheKey, null);
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
