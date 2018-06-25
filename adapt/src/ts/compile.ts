/*
 * Copyright 2017 Unbounded Systems, LLC
 */
import * as fs from "fs";
import * as mkdirp from "mkdirp";
import * as path from "path";
import { CustomError } from "ts-custom-error";
import * as ts from "typescript";
import { trace, tracef } from "../utils/trace";
import { VmModule } from "./context";
import {
    ChainableHost,
    chainHosts,
    debugChainableHosts
    } from "./hosts";
import { ModuleResolver } from "./modules";

const debugCompile = false;
const debugPreprocessing = false;
let debugIntermediateDom = true;
if (debugCompile || debugPreprocessing) debugIntermediateDom = true;

const compilerDefaults: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2016,
    module: ts.ModuleKind.CommonJS,
    experimentalDecorators: true,
    inlineSourceMap: true,
    allowJs: true,
    jsx: ts.JsxEmit.React,
    jsxFactory: "Adapt.createElement",
    //traceResolution: true,
};

export class CompileError extends CustomError {
    constructor(public diags: ts.Diagnostic[], msg: string) {
        super(`Compile error:\n${msg}`);
    }
}

class EmitError extends CustomError {
    constructor(public filename: string, public diags: ts.Diagnostic[],
                public emitSkipped: boolean) {
        super();
    }
}

function diagText(diags: ts.Diagnostic[], cwd: string, lineOffset: number):
                  string {
    return diags.map((d) => {
        let msg = "";
        let src = "";
        if (d.file) {
            msg += path.relative(cwd, d.file.fileName);
            if (d.start) {
                const { line, character } =
                    d.file.getLineAndCharacterOfPosition(d.start);
                msg += ` (${line + 1 + lineOffset},${character + 1})`;

                const lineStart = d.file.getPositionOfLineAndCharacter(line, 0);
                const lineEnd = d.file.getLineEndOfPosition(d.start);
                src = "\n" + d.file.getFullText()
                      .substr(lineStart, lineEnd - lineStart) + "\n";
                src += " ".repeat(character) + "^\n";
            }
            msg += ": ";
        }
        msg += ts.flattenDiagnosticMessageText(d.messageText, "\n");
        msg += ` (${d.code})`;
        msg += src;
        return msg;
    }).join("\n");
}

interface ILangCache {
    version: string;
    snapshot?: ts.IScriptSnapshot;
    sourceFile?: ts.SourceFile;
    contents?: string;
}

// Caching sourceFile objects in the host causes issues across
// invocations of createProgram (I think). Don't cache them until
// I can spend some time ensuring it won't cause the compiler to crash
// when using the type checker in the visitors.
const cacheSourceFiles = false;

class DomCompileHost extends ChainableHost implements ts.LanguageServiceHost {
    private cache: Map<string, ILangCache>;

    constructor(public rootFiles: string[],
                readonly compilerOptions: ts.CompilerOptions,
                chainHost: ChainableHost, id?: string,
                public getProjectVersion?: () => string) {
        super(chainHost.cwd);
        this.cache = new Map<string, ILangCache>();
        this.setSource(chainHost);
        if (id) this._id = id;
    }
    getScriptFileNames = () => this.rootFiles;
    getScriptVersion = (filename: string) => this.getFileVersion(filename);
    getCompilationSettings = () => this.compilerOptions;
    getDefaultLibFileName() { return ts.getDefaultLibFilePath(this.compilerOptions); }

    cacheEntry(fileName: string) {
        const curVer = this.getScriptVersion(fileName);
        if (curVer === undefined) return undefined;

        let c = this.cache.get(fileName);
        if (c && (c.version === curVer)) return c;

        const contents = this.readFile(fileName);
        if (contents === undefined) return undefined;

        // Create new cache entry (possibly throwing away old)
        c = {version: curVer, contents};
        this.cache.set(fileName, c);

        return c;
    }

    @tracef(debugChainableHosts)
    getScriptSnapshot(fileName: string): ts.IScriptSnapshot | undefined {
        fileName = this.getCanonicalFileName(fileName);
        const c = this.cacheEntry(fileName);
        if (!c) return undefined;

        if (c.snapshot) trace(debugChainableHosts, `Cached snapshot: ${fileName}`);
        if (c.snapshot) return c.snapshot;

        if (!c.contents) throw new Error(`Unable to create snapshot`);
        trace(debugChainableHosts, `New snapshot: ${fileName}`);
        c.snapshot = ts.ScriptSnapshot.fromString(c.contents);
        return c.snapshot;
    }

    @tracef(debugChainableHosts)
    getSourceFile(fileName: string, languageVersion: ts.ScriptTarget,
                  onError?: (message: string) => void) {
        const c = this.cacheEntry(fileName);
        if (!c) return undefined;

        trace(debugChainableHosts, `getSourceFile: ${fileName}`);
        if (c.sourceFile) return c.sourceFile;

        // Does a lower layer have it?
        c.sourceFile = this.source.getSourceFile(fileName, languageVersion,
                                                  onError);
        if (c.sourceFile !== undefined) return c.sourceFile;

        trace(debugChainableHosts, `New sourceFile: ${fileName}`);
        if (!c.contents) throw new Error(`Unable to create source file`);

        const sf = ts.createSourceFile(fileName, c.contents, languageVersion,
                                       true);
        if (cacheSourceFiles) c.sourceFile = sf;

        return sf;
    }
    // Return a list of the files unique to this layer
    dir() {
        const ret: string[] = [];
        for (const filename of this.cache.keys()) {
            const c = this.cache.get(filename);
            if (!c) continue;
            let info = "";
            if (c.sourceFile) info += "SF";
            if (c.snapshot) info += "SS";
            if (c.contents !== undefined) info += `C [${c.contents.length}]`;
            ret.push(`${filename}: ${info}`);
        }
        return ret;
    }
 }

// Additional extensions to try for module resolution
//const extensions = [".dom"];

export class Compiler {
    public service: ts.LanguageService;
    private baseHost: ChainableHost;
    private primaryChain: DomCompileHost;
    private projectVersion = 0;
    private _rootFiles: string[];

    constructor(projectRoot: string, rootFiles: string[],
                chainHost: ChainableHost,
                compilerOptions?: ts.CompilerOptions) {
        const finalOptions = {...compilerDefaults,
                              ...compilerOptions};
        (finalOptions as any).allowNonTsExtensions = true;
        // This stops the compiler from searching parent directories
        finalOptions.typeRoots =
            [ path.join(projectRoot, "node_modules", "@types") ];

        const verFunc = this.getProjectVersion.bind(this);
        this._rootFiles = rootFiles;
        this.baseHost = chainHost;

        const partialChain =
            chainHosts(new ModuleResolver(finalOptions, undefined, "Prim"),
                       chainHost);
        this.primaryChain =
            new DomCompileHost(rootFiles, finalOptions, partialChain,
                                               "Prim", verFunc);

        this.service = ts.createLanguageService(this.primaryChain);
    }

    get host(): ChainableHost {
        return this.primaryChain;
    }

    get rootFiles(): string[] {
        return this._rootFiles;
    }
    set rootFiles(val: string[]) {
        this._rootFiles = val;
        this.primaryChain.rootFiles = val;
    }

    @tracef(debugChainableHosts)
    getProjectVersion(): string {
        return this.projectVersion.toString();
    }

    @tracef(debugChainableHosts)
    compile(code: string, filename: string, module: VmModule,
            lineOffset = 0): string | null {
        this.registerExtension(".ts", module);
        this.registerExtension(".tsx", module);

        /* The typescript compiler checks the project version to decide
         * whether to re-query EVERYTHING, which is both slow and difficult
         * to trace issues when debugging because of all the extraneous
         * re-computing that happens.
         * This module already does not guarantee a consistent snapshot of
         * files since the chainable hosts could include one that accesses the
         * filesystem. So simply delay the re-check of file versions until
         * we're done with a complete invocation of the public compile()
         * function. This could be modified to query the host chains on
         * whether they know if their files have changed.
         */
        this.projectVersion++;
        try {
            return this._compile(code, filename);
        } catch (err) {
            if (err instanceof EmitError) {
                throw new CompileError(err.diags,
                    diagText(err.diags, this.primaryChain.getCurrentDirectory(),
                             lineOffset));
            }
            throw err;
        }
    }

    registerExtension(ext: string, mainModule: VmModule) {
        // tslint:disable-next-line:no-this-assignment
        const compiler = this;
        const chain = this.primaryChain;

        // tslint:disable-next-line:only-arrow-functions
        mainModule.registerExt(ext, function(mod: any, filename: string) {
            const oldcompile = mod._compile;
            mod._compile = function(code: string, fname: string) {
                return oldcompile.call(this, compiler._compile(code, fname),
                                       fname);
            };
            try {
                return mod._compile(chain.readFile(filename), filename);
            } catch (err) {
                if (err instanceof EmitError) {
                    throw new CompileError(err.diags,
                        diagText(err.diags,
                                 compiler.primaryChain.getCurrentDirectory(),
                                 0));
                }
                throw err;
            }
        });
    }

    dir() {
        trace(debugChainableHosts, `\n*** Primary chain ***`);
        this.primaryChain.dirTrace();
    }

    @tracef(debugChainableHosts || debugCompile)
    private _compile(code: string, filename: string): string | null {
        let output: ts.EmitOutput;

        const mkDebugWrite = (enable = true) => {
            if (!enable) return () => { return; };
            const startPath = this.primaryChain.getCurrentDirectory();
            const localOutputDir = path.join(process.cwd(), "DebugOut");
            const trim = startPath.length;
            return function debugFileWrite(filePath: string, contents: string) {
                filePath = path.resolve(startPath, filePath);
                if (!filePath.startsWith(startPath)) return;

                const relPath = filePath.slice(trim);
                const outputDir = path.join(localOutputDir,
                                            path.dirname(relPath));
                try {
                    fs.statSync(outputDir);
                } catch (err) {
                    mkdirp.sync(outputDir);
                }
                fs.writeFileSync(path.join(localOutputDir, relPath), contents);
            };
        };

        try {
            output = this.service.getEmitOutput(filename);
        } catch (err) {
            trace(debugChainableHosts, `Error compiling. Dumping chain info`);
            if (debugChainableHosts) this.dir();
            throw err;
        /*
        } finally {
            if (debugIntermediateDom) {
                this.preprocHost._writeFiles(mkDebugWrite());
            }
        */
        }

        const diagnostics = this.service.getCompilerOptionsDiagnostics()
            .concat(this.service.getSyntacticDiagnostics(filename))
            .concat(this.service.getSemanticDiagnostics(filename));

        if (diagnostics.length || output.emitSkipped) {
            throw new EmitError(filename, diagnostics, output.emitSkipped);
        }

        if (/\.d\.ts$/.test(filename)) {
            // No output for an input .d.ts file
            return null;
        }

        const debugWrite = mkDebugWrite(debugIntermediateDom);

        let jsOut: ts.OutputFile | null = null;
        for (const out of output.outputFiles) {
            // Depending on compiler options, there may be .d.ts and .map files
            if (/\.js$/.test(out.name)) {
                jsOut = out;
            }
            this.baseHost.writeFile(out.name, out.text, out.writeByteOrderMark);
            debugWrite(out.name, out.text);
        }
        if (!jsOut) throw new Error(`Couldn't find output file`);
        return jsOut.text;
    }
}
