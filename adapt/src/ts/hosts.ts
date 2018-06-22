/*
 * Copyright 2017 Unbounded Systems, LLC
 *
 * Portions inspired by tspoon, under the following license:
 * Copyright (c) 2016, Wix.com Ltd. All rights reserved. Redistribution and
 * use in source and binary forms, with or without modification, are permitted
 * provided that the following conditions are met:
 *  - Redistributions of source code must retain the above copyright notice,
 *    this list of conditions and the following disclaimer.
 *  - Redistributions in binary form must reproduce the above copyright
 *    notice, this list of conditions and the following disclaimer in the
 *    documentation and/or other materials provided with the distribution.
 *  - Neither the name of Wix.com Ltd. nor the names of its contributors may
 *    be used to endorse or promote products derived from this software
 *    without specific prior written permission.
 */
import * as fs from "fs";
import { EOL } from "os";
import { dirname, join, resolve, sep } from "path";
import * as ts from "typescript";
import { trace, tracef } from "../utils/trace";
// tslint:disable-next-line:no-var-requires
const typeName = require("type-name");

export let debugChainableHosts = false;
export let debugChainableHostsVerbose = false;
if (debugChainableHostsVerbose) debugChainableHosts = true;
export let debugDir = true;

function canonicalPath(cwd: string, fileName: string): string {
    return resolve(cwd, fileName);
}

export class HostImplEnd {
    public _id = "";
    _fileExists(fileName: string): boolean {
        return false;
    }
    _directoryExists(directoryName: string): boolean {
        return false;
    }
    _readFile(fileName: string): string | undefined {
        // @ts-ignore
        return undefined;
    }
    _getFileVersion(fileName: string): string {
        // @ts-ignore
        return undefined;
    }
    _getSourceFile(fileName: string,
                             languageVersion: ts.ScriptTarget,
                             onError?: (message: string) => void):
                             ts.SourceFile {
        // @ts-ignore
        return undefined;
    }
    _writeFile(path: string, data: string,
                         writeByteOrderMark: boolean,
                         onError?: (message: string) => void,
                         sourceFiles?: ReadonlyArray<ts.SourceFile>): void {
        throw new Error(`Base Compiler host is not writable`);
    }
    _useCaseSensitiveFileNames() {
        return true;
    }
    _getCurrentDirectory(): string {
        return "";
    }
    _getNewLine(): string {
        return EOL;
    }
    _getDefaultLibFileName(options: ts.CompilerOptions): string {
        return "lib.d.ts";
    }
    _getCancellationToken(): ts.CancellationToken {
        // @ts-ignore
        return null;
    }
    _getDirectories(path: string): string[] {
        return [];
    }
    _resolveModuleName(modName: string, containingFile: string, runtime?: boolean):
        ts.ResolvedModule {
        // @ts-ignore
        return { resolvedFileName: undefined };
    }
    _resolveModuleNames(moduleNames: string[], containingFile: string,
                        reusedNames?: string[]): ts.ResolvedModule[] {
        return moduleNames.map((modName) => {
            return this._resolveModuleName(modName, containingFile, false);
        });
    }
    _realFilename(fileName: string): string | undefined {
        return undefined;
    }
    // Return a list of the files unique to this layer
    _dir(): string[] {
        return [];
    }
}

// The internal side of the API
export interface HostImpl extends HostImplEnd {}

// A CompilerHost implements both the internal and external sides of the API
export interface CompilerHost extends ts.CompilerHost, HostImpl { }

export abstract class ChainableHost implements CompilerHost {
    public _id = "";
    // @ts-ignore
    protected source: HostImpl | ChainableHost = null;

    setSource(source: HostImpl | ChainableHost): void {
        if (this.source === null) {
            this.source = source;
        } else {
            throw new Error(`A chainable host can be connected to a source ` +
                `only once. It looks like you're trying to include the same ` +
                `instance in multiple chains.`);
        }
    }
    sourceChain(): ChainableHost {
        if (isChainableHost(this.source)) {
            return this.source;
        }
        throw new Error(`Host's source is not chainable`);
    }
    @tracef(debugChainableHosts)
    fileExists(fileName: string): boolean {
        fileName = this._getCanonicalFileName(fileName);
        return this._fileExists(fileName);
    }
    _fileExists(fileName: string): boolean {
        return this.source._fileExists(fileName);
    }
    @tracef(debugChainableHosts)
    directoryExists(directoryName: string): boolean {
        directoryName = this._getCanonicalFileName(directoryName);
        return this._directoryExists(directoryName);
    }
    _directoryExists(directoryName: string): boolean {
        return this.source._directoryExists(directoryName);
    }
    @tracef(debugChainableHosts)
    getCurrentDirectory(): string {
        return this._getCurrentDirectory();
    }
    _getCurrentDirectory(): string {
        return this.source._getCurrentDirectory();
    }
    @tracef(debugChainableHosts)
    readFile(fileName: string): string {
        fileName = this._getCanonicalFileName(fileName);
        // @ts-ignore
        return this._readFile(fileName);
    }
    _readFile(fileName: string): string | undefined {
        return this.source._readFile(fileName);
    }
    @tracef(debugChainableHosts)
    getFileVersion(fileName: string): string {
        fileName = this._getCanonicalFileName(fileName);
        return this._getFileVersion(fileName);
    }
    _getFileVersion(fileName: string): string {
        return this.source._getFileVersion(fileName);
    }
    @tracef(debugChainableHosts)
    getSourceFile(fileName: string, languageVersion: ts.ScriptTarget,
                  onError?: (message: string) => void): ts.SourceFile | undefined {
        fileName = this._getCanonicalFileName(fileName);
        return this._getSourceFile(fileName, languageVersion, onError);
    }
    // @ts-ignore
    _getSourceFile(fileName: string, languageVersion: ts.ScriptTarget,
                   onError?: (message: string) => void): ts.SourceFile | undefined {
        return this.source._getSourceFile(fileName, languageVersion, onError);
    }
    @tracef(debugChainableHosts)
    writeFile(path: string, data: string, writeByteOrderMark: boolean,
              onError?: (message: string) => void,
              sourceFiles?: ReadonlyArray<ts.SourceFile>): void {
        path = this._getCanonicalFileName(path);
        this._writeFile(path, data, writeByteOrderMark, onError, sourceFiles);
    }
    _writeFile(path: string, data: string, writeByteOrderMark: boolean,
               onError?: (message: string) => void,
               sourceFiles?: ReadonlyArray<ts.SourceFile>): void {
        this.source._writeFile(path, data, writeByteOrderMark, onError,
                               sourceFiles);
    }
    @tracef(debugChainableHostsVerbose)
    getDirectories(path: string): string[] {
        path = this._getCanonicalFileName(path);
        return this._getDirectories(path);
    }
    _getDirectories(path: string): string[] {
        return this.source._getDirectories(path);
    }
    resolveModuleName(modName: string, containingFile: string, runtime = false):
        ts.ResolvedModule {
        return this._resolveModuleName(modName, containingFile, runtime);
    }
    _resolveModuleName(modName: string, containingFile: string, runtime = false):
        ts.ResolvedModule {
        return this.source._resolveModuleName(modName, containingFile, runtime);
    }
    resolveModuleNames(moduleNames: string[], containingFile: string,
                       reusedNames?: string[]): ts.ResolvedModule[] {
        return this._resolveModuleNames(moduleNames, containingFile, reusedNames);
    }
    _resolveModuleNames(moduleNames: string[], containingFile: string,
                        reusedNames?: string[]): ts.ResolvedModule[] {
        return this.source._resolveModuleNames(moduleNames, containingFile,
                                               reusedNames);
    }
    getDefaultLibFileName(options: ts.CompilerOptions): string {
        return this._getDefaultLibFileName(options);
    }
    _getDefaultLibFileName(options: ts.CompilerOptions): string {
        return this.source._getDefaultLibFileName(options);
    }
    getCancellationToken(): ts.CancellationToken {
        return this._getCancellationToken();
    }
    _getCancellationToken(): ts.CancellationToken {
        return this.source._getCancellationToken();
    }
    getCanonicalFileName(fileName: string) {
        return this._getCanonicalFileName(fileName);
    }
    _getCanonicalFileName(fileName: string) {
        return canonicalPath(this._getCurrentDirectory(), fileName);
    }
    useCaseSensitiveFileNames() {
        return this._useCaseSensitiveFileNames();
    }
    _useCaseSensitiveFileNames(): boolean {
        return this.source._useCaseSensitiveFileNames();
    }
    getNewLine(): string {
        return this._getNewLine();
    }
    _getNewLine(): string {
        return this.source._getNewLine();
    }
    realFilename(fileName: string): string | undefined {
        fileName = this._getCanonicalFileName(fileName);
        return this._realFilename(fileName);
    }
    /**
     * Should be implemented by any Host that performs filename translation.
     * Given a possibly "faked" or virtual filename, return the real filename
     * that corresponds.
     */
    _realFilename(fileName: string): string | undefined {
        return this.source._realFilename(fileName);
    }
    dir() {
        const dflag = debugChainableHosts || debugDir;
        if (!dflag) return;
        // tslint:disable-next-line:no-this-assignment
        let s: ChainableHost = this;
        while (true) {
            const objname = typeName(s) + s._id;
            trace(dflag, `\nFiles in ${objname}:`);
            for (const f of s._dir()) {
                trace(dflag, `  ${f}`);
            }
            if (!s.source || !isChainableHost(s.source)) break;
            s = s.source;
        }
    }
    _dir(): string[] {
        return [];
    }
}

function isChainableHost(host: ChainableHost | HostImpl): host is ChainableHost {
    return host && ((host as any).source !== undefined);
}

export class FileSystemHost extends ChainableHost {
    constructor(private rootDir: string, readonly cwd = process.cwd()) {
        super();
        this.rootDir = fs.realpathSync(rootDir);
    }

    _readDirectory(path: string, extensions?: ReadonlyArray<string>,
        excludes?: ReadonlyArray<string>,
        includes?: ReadonlyArray<string>, depth?: number): string[] {
        if (!this.allowed(path)) return [];
        return ts.sys.readDirectory(path, extensions, excludes, includes,
                                    depth);
    }

    _getCurrentDirectory(): string {
        return this.cwd;
    }

    _getDirectories(path: string): string[] {
        if (!this.allowed(path)) return [];
        return ts.sys.getDirectories(path);
    }

    _directoryExists(path: string): boolean {
        if (!this.allowed(path)) return false;
        return ts.sys.directoryExists(path);
    }

    @tracef(debugChainableHosts)
    _readFile(path: string, encoding?: string): string | undefined {
        if (!this.allowed(path)) return undefined;
        const contents = fs.readFileSync(path, encoding);
        if (contents) return contents.toString();
        return undefined;
    }

    @tracef(debugChainableHosts)
    _getFileVersion(fileName: string): string {
        try {
            const stats = fs.statSync(fileName);
            return stats.mtimeMs.toString();
        } catch (err) {
            return this.source._getFileVersion(fileName);
        }
    }

    _fileExists(path: string): boolean {
        return (this.allowed(path) && ts.sys.fileExists(path));
    }

    _realFilename(fileName: string): string | undefined {
        return fileName;
    }

    _writeFile(path: string, data: string, writeByteOrderMark: boolean,
               onError?: (message: string) => void,
               sourceFiles?: ReadonlyArray<ts.SourceFile>): void {
        // tslint:disable-next-line:no-console
        console.log(`WARNING: trying to write file ${path}`);
    }

    // Return a list of the files unique to this layer
    _dir(): string[] {
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

    // @ts-ignore
    constructor(private rootDir: string, readonly cwd = process.cwd()) {
        super();
        this.mkdirs(rootDir);
        this.mkdirs(cwd);
    }

    @tracef(debugChainableHosts)
    _writeFile(path: string, data: string, writeByteOrderMark: boolean,
               onError?: (message: string) => void,
               sourceFiles?: ReadonlyArray<ts.SourceFile>): void {

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
            // @ts-ignore
            this.dirs.get(dir).add(path);
        }
    }

    @tracef(debugChainableHosts)
    _readFile(path: string, encoding?: string): string | undefined {
        const f = this.files.get(path);
        if (f !== undefined) {
            return f.contents;
        }
        return this.source._readFile(path);
    }

    @tracef(debugChainableHosts)
    _getFileVersion(fileName: string): string {
        const f = this.files.get(fileName);
        if (f !== undefined) {
            return f.version.toString();
        }
        return this.source._getFileVersion(fileName);
    }

    _getCurrentDirectory(): string {
        return this.cwd;
    }

    @tracef(debugChainableHostsVerbose)
    _fileExists(path: string): boolean {
        return (this.files.has(path) || super._fileExists(path));
    }
    @tracef(debugChainableHostsVerbose)
    _directoryExists(directoryName: string): boolean {
        return this.dirs.has(directoryName) ||
               super._directoryExists(directoryName);
    }
    @tracef(debugChainableHostsVerbose)
    _getDirectories(path: string): string[] {
        const pdirs = super._getDirectories(path);

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

    // Return a list of the files unique to this layer
    _dir(): string[] {
        return Array.from(this.files.keys());
    }

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

export function chainHosts(lower: HostImpl | ChainableHost,
                           ...upper: ChainableHost[]): ChainableHost {
    if (upper.length < 1) throw new Error(`Must chain at least two hosts`);
    upper[0].setSource(lower);

    let i: number;
    for (i = 1; i < upper.length; i++) {
        upper[i].setSource(upper[i - 1]);
    }
    return upper[i - 1];
}

export function MemFileHost(rootDir: string): ChainableHost {
    return chainHosts(new HostImplEnd(),
                      new FileSystemHost(rootDir),
                      new MemoryHost(rootDir));
}

export function copyToHost(host: ChainableHost,
                           src: string, dest: string) {
    function walkSync(s: string, d: string) {
        if (fs.statSync(s).isDirectory()) {
            fs.readdirSync(s).forEach((file) => {
                const fsrc = join(s, file);
                const fdest = join(d, file);
                walkSync(fsrc, fdest);
            });
        } else {
            host.writeFile(d, fs.readFileSync(s).toString(), false);
        }
    }

    walkSync(src, dest);
}
