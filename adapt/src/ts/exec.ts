import * as path from "path";
import { Compiler } from "./compile";
import { VmContext } from "./context";
import { ChainableHost, debugChainableHosts, MemFileHost } from "./hosts";

// Compile and run the TypeScript files specified by rootFiles. The first
// file in the list is considered the "main" file and will be the one that
// gets executed.  If specified, context is an optional object that contains
// global variables for the V8 context where the TypeScript program will
// execute.
// host may contain the contents of one or more of the files needed for the
// compile & execution.
// Returns the last value of the executed file.
export interface ExecOptions {
    context?: any;
    host?: ChainableHost;
    compiler?: Compiler;
    lineOffset?: number;
    projectRoot?: string;
}

export function exec(rootFiles: string | string[], options: ExecOptions): any {
    if (typeof rootFiles === "string") rootFiles = [rootFiles];
    if (rootFiles.length === 0) throw new Error(`No root files to exec`);

    const mainPath = rootFiles[0];
    const tsDirname = path.dirname(mainPath);
    const tsBasename = path.basename(mainPath);

    let compiler = options.compiler;
    const context = options.context || {};
    const projectRoot = options.projectRoot || tsDirname;

    if (compiler) {
        if (compiler.rootFiles.indexOf(mainPath) === -1) {
            throw new Error(`File ${mainPath} must be present in ` +
                            `Compiler.rootFiles`);
        }
    } else {
        const host = options.host || MemFileHost("/", projectRoot);
        compiler = new Compiler(projectRoot, rootFiles, host);
    }
    const ccontext = new VmContext(context, tsDirname, tsBasename,
                                        compiler.host);

    const contents = compiler.host.readFile(mainPath);
    if (!contents) throw new Error(`Unable to read file ${mainPath}`);
    const jsText = compiler.compile(contents, mainPath, ccontext.mainModule,
                                    options.lineOffset || 0);

    if (debugChainableHosts) {
        // tslint:disable-next-line:no-console
        console.log(`After compile`);
        compiler.dir();
    }

    if (jsText == null) return undefined;

    // And run the transpiled JS in the context vm
    return ccontext.run(jsText);
}

export function execString(code: string, context: any = {},
                           host?: ChainableHost) {
    if (!host) {
        host = MemFileHost("/");
    }
    const rootPath = path.join(host.getCurrentDirectory(), "[root].ts");
    host.writeFile(rootPath, code, false);
    return exec(rootPath, {context, host});
}
