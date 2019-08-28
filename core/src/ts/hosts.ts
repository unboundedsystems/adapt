/*
 * Copyright 2017-2019 Unbounded Systems, LLC
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
import * as fs from "fs";
import { dirname, resolve, sep } from "path";
import { InternalError } from "../error";
import { trace, tracef } from "../utils";
import * as ts from "./tsmod";

// tslint:disable-next-line:no-var-requires
const typeName = require("type-name");

const tsmod = ts.tsmod;

export let debugChainableHosts = false;
export let debugChainableHostsVerbose = false;
if (debugChainableHostsVerbose) debugChainableHosts = true;
export let debugDir = true;

// tslint:disable:member-ordering

// tslint:disable-next-line:ban-types
type FunctionPropertyNames<T> = { [K in keyof T]: T[K] extends Function ? K : never }[keyof T];

type InitCanonicalize<T> = { [K in keyof T]?: number };
// Member function -> Which arg to canonicalize
const initCanonicalize: InitCanonicalize<ChainableHost> = {
    fileExists: 0,
    directoryExists: 0,
    readFile: 0,
    getFileVersion: 0,
    getSourceFile: 0,
    writeFile: 0,
    getDirectories: 0,
    realFilename: 0,
};

const noop: any = undefined;

function callSource(proto: object, propKey: string, desc: PropertyDescriptor) {
    return {
        ...desc,
        value: function _toSource(this: ChainableHost, ...args: any[]) {
            if (!this.source) throw new InternalError(`source for ${this.constructor.name} is null`);
            return (this.source as any)[propKey].apply(this.source, args);
        }
    };
}

export abstract class ChainableHost implements ts.CompilerHost {
    public _id = "";

    // @ts-ignore - Cheat so we don't have to check for null everywhere
    source: ChainableHost = null;

    constructor(readonly cwd: string) {
        for (const key of Object.keys(initCanonicalize)) {
            // @ts-ignore
            this.canonicalizeFunc(key, initCanonicalize[key]);
        }
    }

    @tracef(debugChainableHosts)
    @callSource
    directoryExists(directoryname: string): boolean { return noop; }

    @tracef(debugChainableHosts)
    @callSource
    fileExists(fileName: string): boolean { return noop; }

    @callSource
    getCancellationToken(): ts.CancellationToken { return noop; }

    @callSource
    getDefaultLibFileName(options: ts.CompilerOptions): string { return noop; }

    @tracef(debugChainableHosts)
    @callSource
    getDirectories(path: string): string[] { return noop; }

    @tracef(debugChainableHosts)
    @callSource
    getFileVersion(fileName: string): string { return noop; }

    @tracef(debugChainableHosts)
    @callSource
    getNewLine(): string { return noop; }

    @tracef(debugChainableHosts)
    @callSource
    getSourceFile(fileName: string, languageVersion: ts.ScriptTarget,
                  onError?: (message: string) => void): ts.SourceFile | undefined { return noop; }

    @tracef(debugChainableHosts)
    @callSource
    readFile(fileName: string): string | undefined { return noop; }

    /**
     * Should be implemented by any Host that performs filename translation.
     * Given a possibly "faked" or virtual filename, return the real filename
     * that corresponds.
     */
    @callSource
    realFilename(fileName: string): string | undefined { return noop; }

    @callSource
    resolveModuleName(modName: string, containingFile: string, runnable?: boolean):
        ts.ResolvedModule | undefined { return noop; }

    @callSource
    resolveModuleNames(moduleNames: string[], containingFile: string,
                         reusedNames?: string[]): ts.ResolvedModule[] { return noop; }

    @callSource
    useCaseSensitiveFileNames(): boolean { return noop; }

    @tracef(debugChainableHosts)
    @callSource
    writeFile(fileName: string, data: string) { return noop; }

    getCanonicalFileName(fileName: string) {
        return resolve(this.getCurrentDirectory(), fileName);
    }

    getCurrentDirectory(): string {
        return (this.source && this.source.getCurrentDirectory()) || this.cwd;
    }

    setSource(source: ChainableHost): void {
        if (this.source === null) {
            this.source = source;
        } else {
            throw new Error(`A chainable host can be connected to a source ` +
                `only once. It looks like you're trying to include the same ` +
                `instance in multiple chains.`);
        }
    }

    dir(): string[] { return []; }
    dirTrace() {
        const dflag = debugChainableHosts || debugDir;
        if (!dflag) return;
        // tslint:disable-next-line:no-this-assignment
        let s: ChainableHost = this;
        while (true) {
            const objname = typeName(s) + s._id;
            trace(dflag, `\nFiles in ${objname}:`);
            for (const f of s.dir()) {
                trace(dflag, `  ${f}`);
            }
            if (!s.source) break;
            s = s.source;
        }
    }

    private canonicalizeFunc(funcName: FunctionPropertyNames<this>, argNo: number) {
        const origFunc = this[funcName];
        (this as any)[funcName] = function (this: ChainableHost, ...args: any[]) {
            args[argNo] = resolve(this.getCurrentDirectory(), args[argNo]);
            return (origFunc as any).apply(this, args);
        };
    }
}

export class HostFinal extends ChainableHost {
    fileExists() { return false; }
    directoryExists() { return false; }
    getFileVersion() { return undefined as any; }
    getSourceFile() { return undefined; }
    useCaseSensitiveFileNames() { return true; }
    getNewLine() { return "\n"; }
    getDefaultLibFileName() { return "lib.d.ts"; }
    resolveModuleName() { return {resolvedFileName: undefined} as any; }
    getDirectories() { return []; }
    readFile() { return undefined; }
    getCancellationToken() { return null as any; }

    resolveModuleNames(moduleNames: string[], containingFile: string) {
        return moduleNames.map((modName) => {
            return this.resolveModuleName();
        });
    }
    realFilename() { return undefined; }
    writeFile() { throw new Error(`Base Compiler host is not writable`); }
    dir() { return []; }
}

export class FileSystemHost extends ChainableHost {
    constructor(private rootDir: string, cwd = process.cwd()) {
        super(cwd);
        this.rootDir = fs.realpathSync(rootDir);
    }

    readDirectory(path: string, extensions?: ReadonlyArray<string>,
        excludes?: ReadonlyArray<string>,
        includes?: ReadonlyArray<string>, depth?: number): string[] {
        if (!this.allowed(path)) return [];
        return tsmod().sys.readDirectory(path, extensions, excludes, includes,
                                    depth);
    }

    getDirectories(fileName: string) {
        if (!this.allowed(fileName)) return [];
        return tsmod().sys.getDirectories(fileName);
    }

    directoryExists(path: string) {
        if (!this.allowed(path)) return false;
        return tsmod().sys.directoryExists(path);
    }

    @tracef(debugChainableHosts)
    readFile(path: string, encoding?: string) {
        if (!this.allowed(path)) return undefined;
        const contents = fs.readFileSync(path, encoding);
        if (contents) return contents.toString();
        return undefined;
    }

    @tracef(debugChainableHosts)
    getFileVersion(fileName: string) {
        try {
            const stats = fs.statSync(fileName);
            return stats.mtimeMs.toString();
        } catch (err) {
            return this.source.getFileVersion(fileName);
        }
    }

    @tracef(debugChainableHosts)
    fileExists(path: string) {
        return this.allowed(path) && tsmod().sys.fileExists(path);
    }
    realFilename(fileName: string) { return fileName; }
    writeFile() { throw new Error(`FileSystemHost is not writable`); }
    dir() {
        // We don't really want to list the whole filesystem.
        return [`File system at ${this.rootDir}`];
    }

    private allowed(path: string) {
        try {
            const resolved = fs.realpathSync(path);
            return resolved.startsWith(this.rootDir);
        } catch (err) {
            if (err.code && err.code === "ENOENT") {
                return false;
            }
            throw err;
        }
    }
}

interface MemFileVersion {
    version: number;
    contents: string;
}

// Pretends files are on disk for the TS Language Services API
export class MemoryHost extends ChainableHost {
    private files = new Map<string, MemFileVersion>();
    private dirs  = new Map<string, Set<string>>();

    constructor(rootDir: string, cwd = process.cwd()) {
        super(cwd);
        this.mkdirs(rootDir);
        this.mkdirs(cwd);
    }

    @tracef(debugChainableHosts)
    writeFile(path: string, data: string) {
        let f = this.files.get(path);
        if (f !== undefined) {
            f.version++;
            f.contents = data;
        } else {
            f = {version: 1, contents: data};
            this.files.set(path, f);

            // Set up directory
            const dir = dirname(path);
            this.mkdirs(dir);
            const dirSet = this.dirs.get(dir);
            if (!dirSet) throw new InternalError(`dir not found`);
            dirSet.add(path);
        }
    }

    @tracef(debugChainableHosts)
    readFile(path: string, encoding?: string) {
        const f = this.files.get(path);
        if (f !== undefined) {
            return f.contents;
        }
        return this.source.readFile(path);
    }

    @tracef(debugChainableHosts)
    getFileVersion(fileName: string) {
        const f = this.files.get(fileName);
        if (f !== undefined) {
            return f.version.toString();
        }
        return this.source.getFileVersion(fileName);
    }

    @tracef(debugChainableHosts)
    fileExists(path: string) {
        return (this.files.has(path) || super.fileExists(path));
    }
    @tracef(debugChainableHosts)
    directoryExists(directoryName: string) {
        return this.dirs.has(directoryName) ||
               this.source.directoryExists(directoryName);
    }
    @tracef(debugChainableHosts)
    getDirectories(path: string) {
        const pdirs = this.source.getDirectories(path);

        if (!path.endsWith(sep)) {
            path += sep;
        }

        // Yes this is crappy, but this operation is very infrequent.
        // regex is anything that matches path in the beginning and only
        // has one more slash (added above)
        const re = new RegExp(`^${path}[^/]+$`);
        for (const d of this.dirs.keys()) {
            if (re.test(d)) pdirs.push(d);
        }
        return pdirs;
    }

    dir() { return Array.from(this.files.keys()); }

    private mkdirs(dir: string) {
        while (true) {
            if (!this.dirs.get(dir)) {
                this.dirs.set(dir, new Set<string>());
            }
            const parent = dirname(dir);
            if (parent === dir) {
                break;
            }
            dir = parent;
        }
    }
}

export function chainHosts(...hosts: ChainableHost[]): ChainableHost {
    if (hosts.length < 2) throw new Error(`Must chain at least two hosts`);

    for (let i = 1; i < hosts.length; i++) {
        hosts[i - 1].setSource(hosts[i]);
    }
    return hosts[0];
}

export function MemFileHost(rootDir: string, cwd = process.cwd()): ChainableHost {
    return chainHosts(new MemoryHost(rootDir, cwd),
                      new FileSystemHost(rootDir, cwd),
                      new HostFinal(cwd));
}
