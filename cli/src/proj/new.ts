/*
 * Copyright 2019-2020 Unbounded Systems, LLC
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

import {
    ensureError,
    InternalError,
    isObject,
    MaybeArray,
    mkdtmp,
    readJson5,
    toArray,
    UserError,
} from "@adpt/utils";
import copy from "copy";
import db from "debug";
import execa from "execa";
import fs from "fs-extra";
import { isArray, isString } from "lodash";
import pkgArg from "npm-package-arg";
import pacote from "pacote";
import path from "path";
import { SemVer } from "semver";
import escape from "shell-escape";

const debugNew = db("adapt:project:new");

export const adaptVersionLabelPrefix = "adapt-v";

export type LogString = (msg: string) => void;

export interface AdaptStarter {
    readonly dest: string;
    readonly isLocal: boolean;
    readonly name?: string;
    readonly spec: string;
    readonly args: string[];

    init(): Promise<void>;
    download(log: LogString): Promise<void>;
    run(log: LogString): Promise<void>;
    cleanup(): Promise<void>;
}

export type StarterValidator = (config: any, propName: string) => void;
export interface StarterValidators {
    [propName: string]: StarterValidator;
}

export interface StarterConfig {
    adaptDir?: MaybeArray<string>;
    files?: MaybeArray<string>;
    init?: string;
    name?: string;
    version?: string;
}

const validators: StarterValidators = {
    adaptDir: checkMaybeArrayString,
    files: checkMaybeArrayString,
    init: checkString,
    name: checkString,
    version: checkString,
};

export const starterConfigDefaults = {
    adaptDir: "deploy",
};

export const starterJsonFile = "adapt_starter.json";

class SpecError extends UserError {
    constructor(spec: string, msg: string) {
        super(`Unable to use '${spec}' as a starter: ${msg}`);
    }
}

const pacoteLog = {
    error: debugNew,
    warn: debugNew,
    info: debugNew,
    verbose: debugNew,
    silly: debugNew,
    http: debugNew,
    pause: debugNew,
    resume: debugNew,
};

interface SpecInfo {
    /**
     * The spec before tacking on any adapt version labels
     */
    base: string;
    /**
     * The spec to be fetched, which may or may not have version labels
     */
    complete: string;
    /**
     * Adapt version labels only supported for git and registry
     */
    type: "git" | "local" | "remote" | "registry";
}

export interface AdaptStarterOptions {
    adaptVersion: SemVer;
    args: string[];
    destDir: string;
    spec: string;
}

export function createStarter(opts: AdaptStarterOptions): AdaptStarter {
    return new AdaptStarterImpl(opts);
}

class AdaptStarterImpl {
    readonly adaptVersion: SemVer;
    readonly args: string[];
    readonly dest: string;
    readonly isLocal: boolean;
    readonly spec: string;

    protected starterDir_?: string;
    protected tmpDir_?: string;
    protected rmDir?: () => Promise<void>;

    constructor(opts: AdaptStarterOptions) {
        this.adaptVersion = opts.adaptVersion;
        this.args = opts.args;
        this.dest = opts.destDir;
        this.spec = opts.spec;
        this.isLocal = isLocalSpec(this.spec);
    }

    async init() {
        this.starterDir_ = await this.localDir() || await this.mkTmp();
    }

    async download(log: LogString) {
        const cache = path.join(this.tmpDir, "cache");
        await fs.ensureDir(cache);

        const opts: pacote.Options = { cache };
        if (debugNew.enabled) opts.log = pacoteLog;

        const specs = trySpecs(this.spec, this.adaptVersion);
        // Remember errors that pertain to accessing the base spec, independent
        // of version label.
        const baseSpecErrs = new Map<string, Error>();

        do {
            const spec = specs.shift();
            if (!spec) throw new InternalError(`empty spec list`);

            try {
                const prevErr = baseSpecErrs.get(spec.base);
                if (prevErr) throw prevErr;

                log(`Trying ${spec.complete}`);
                await pacote.extract(spec.complete, this.starterDir, opts);
                return;

            } catch (err) {
                err = ensureError(err);
                if (err.code === "ENOENT" && err.path === path.join(this.starterDir, "package.json")) {
                    // SUCCESS. We don't require a package.json
                    return;
                }
                if (specs.length === 0) throw new SpecError(spec.complete, err.message);

                // If we can't access the base spec (e.g. git repo or npm package
                // doesn't exist), then don't try additional versions of that
                // base spec.
                if (isErrorWithBaseSpec(spec, err)) baseSpecErrs.set(spec.base, err);
            }
        } while (true);
    }

    async run(log: LogString) {
        try {
            log(`Validating starter config`);
            const config = await validateConfig(this.starterDir);

            await fs.ensureDir(this.dest);
            await copyFiles(config, log, this.starterDir, this.dest);
            await updateVersions(config, log, this.dest, this.adaptVersion);
            await runScripts(config, log, this.starterDir, this.dest, this.args);

        } catch (err) {
            err = ensureError(err);
            throw new SpecError(this.spec, err.message);
        }
    }

    async cleanup() {
        const rm = this.rmDir;
        delete this.rmDir;
        if (rm) await rm();
    }

    protected get starterDir() {
        if (!this.starterDir_) throw new InternalError(`starterDir is null`);
        return this.starterDir_;
    }

    protected get tmpDir() {
        if (!this.tmpDir_) throw new InternalError(`tmpDir is null`);
        return this.tmpDir_;
    }

    protected async localDir() {
        if (!this.isLocal) return undefined;

        const dir = path.resolve(this.spec);
        switch (await fileType(dir)) {
            case "DIR":
                return dir;
            case false:
                throw new SpecError(this.spec, `'${dir}' not found`);
            default:
            case "FILE":
                throw new SpecError(this.spec, `'${dir}' is not a directory`);
        }
    }

    protected async mkTmp() {
        const tmpPromise = mkdtmp("adapt-new");
        this.rmDir = tmpPromise.remove;
        this.tmpDir_ = await tmpPromise;
        const dir = path.join(this.tmpDir_, "starter");
        await fs.ensureDir(dir);
        return dir;
    }
}

function checkString(config: any, prop: string) {
    if (prop in config && !isString(config[prop])) {
        throw new Error(`${starterJsonFile}: '${prop}' must be a string`);
    }
}

function checkMaybeArrayString(config: any, prop: string) {
    if (!(prop in config)) return;
    const val = config[prop];
    if (isString(val)) return;
    if (!isArray(val)) {
        throw new Error(`${starterJsonFile}: '${prop}' must be a string or ` +
            `an array of strings`);
    }
    val.forEach((f, i) => {
        if (!isString(f)) {
            throw new Error(`${starterJsonFile}: '${prop}[${i}]' must be a string`);
        }
    });
}

async function validateConfig(starterDir: string): Promise<StarterConfig> {
    let config: any;
    try {
        config = await readJson5(path.join(starterDir, starterJsonFile));
    } catch (err) {
        err = ensureError(err);
        const msg = err.code === "ENOENT" ? `no ${starterJsonFile} file found` :
            err.name === "SyntaxError" ? `unable to parse ${starterJsonFile}:` +
                err.message.replace(/^Invalid JSON5 format:/, "") :
            err.message;
        throw new Error(msg);
    }

    if (!isObject(config)) {
        throw new Error(`${starterJsonFile} must contain a single object`);
    }

    config = { ...starterConfigDefaults, ...config };

    Object.keys(validators).forEach((prop) => validators[prop](config, prop));
    return config;
}

async function copyFiles(config: StarterConfig, log: LogString,
    starterDir: string, dest: string) {

    if (!config.files) return;

    const opts: any = {
        overwrite: false,
        cwd: starterDir,
        srcBase: starterDir,
        dot: true,
    };

    try {
        log(`Copying files`);
        for (let f of config.files) {
            // All files are relative to the srcRoot
            while (f.startsWith("/")) f = f.slice(1);
            // Turn directories into a globstar
            if ((await fileType(path.join(starterDir, f))) === "DIR") f = f + "/**";

            await new Promise((resolve, reject) => {
                copy(f, dest, opts, (err) => err ? reject(err) : resolve());
            });
        }
    } catch (err) {
        err = ensureError(err);
        const prefix = "Error copying files: ";
        if (err.code === "ENOENT" && err.path) {
            throw new Error(prefix + `'${err.path}' not found`);
        } else {
            throw new Error(prefix + err.message);
        }
    }
}

async function loadPackageJsonIfPresent(filename: string): Promise<any> {
    let pj: any;

    try {
        pj = await fs.readJson(filename);
    } catch (err) {
        if (err.code === "ENOENT") return undefined;
        throw err;
    }
    if (isArray(pj) || !isObject(pj)) {
        throw new UserError(`Invalid package.json file '${filename}': ` +
            `file must contain a single object`);
    }
    return pj;
}

const depTypes = [
    "dependencies",
    "devDependencies",
];

const updateableDeps = [
    "@adpt/cli",
    "@adpt/cloud",
    "@adpt/core",
    "@adpt/utils",
];

export async function updateVersions(config: StarterConfig, log: LogString,
    dest: string, ver: SemVer) {

    let logged = false;
    const adaptDirs = toArray(config.adaptDir || "");
    for (const d of adaptDirs) {
        let updated = false;
        const pkgFile = path.resolve(dest, d, "package.json");
        const pj = await loadPackageJsonIfPresent(pkgFile);
        if (!pj) continue;

        for (const depType of depTypes) {
            const deps = pj[depType];
            if (!deps || !isObject(deps)) continue;
            for (const depName of updateableDeps) {
                if (deps[depName] === "CURRENT") {
                    if (!logged) {
                        log(`Updating dependency versions`);
                        logged = true;
                    }
                    updated = true;
                    deps[depName] = ver.version;
                }
            }
        }
        if (updated) {
            await fs.writeJson(pkgFile, pj, { spaces: 4 });
        }
    }
}

async function runScripts(config: StarterConfig, log: LogString,
    starterDir: string, dest: string, args: string[]) {

    if (!config.init) return;

    let cmd = config.init;
    // Node does the stupidest thing possible with the args array when
    // options.shell is true; it joins them with a space. Ugh.
    if (args.length > 0) cmd += " " + escape(args);

    log(`Running init script`);
    debugNew(`Init script: ${cmd}`);

    try {
        const env = {
            ADAPT_STARTER_DIR: starterDir,
        };
        const ret = await execa(cmd, { all: true, cwd: dest, env, shell: true });
        debugNew(`Init script stdout:\n${ret.stdout}\nInit script stderr:\n${ret.stderr}`);

    } catch (err) {
        throw new UserError(`Error running init script:\n${err.shortMessage}\n${err.all}\n`);
    }
}

function isLocalSpec(spec: string) {
    return (
        spec.startsWith(".") ||
        path.isAbsolute(spec) ||
        spec.startsWith("~" + path.sep)  // NPM and friends specifically recognize this
    );
}

function mightBeGallerySpec(spec: string) {
    return ! /[:/@]/.test(spec);
}

function galleryUrl(spec: string, verString?: string) {
    return verString ?
        `git+https://gitlab.com/adpt/starters/${spec}#${verString}` :
        `git+https://gitlab.com/adpt/starters/${spec}`;
}

function mightBeNpmPackage(info: pkgArg.Result) {
    return info.registry && info.name != null;
}

async function fileType(filename: string): Promise<"FILE" | "DIR" | false> {
    try {
        const stat = await fs.stat(filename);
        return stat.isDirectory() ? "DIR" : "FILE";
    } catch (err) {
        return false;
    }
}

export function tryVersions(orig: SemVer): string[] {
    const { major, minor, patch } = orig;
    const verSet = new Set<string>();
    verSet.add(orig.version);
    verSet.add([ major, minor, patch ].join("."));
    verSet.add([ major, minor ].join("."));
    verSet.add([ major ].join("."));

    return [ ...verSet ].map((v) => adaptVersionLabelPrefix + v);
}

export function badPackageType(pkgType: never): never {
    throw new InternalError(`Invalid package type ${pkgType}`);
}

function toSpecInfoType(pkgType: pkgArg.Result["type"]): SpecInfo["type"] {
    switch (pkgType) {
        case "version":
        case "tag":
        case "range":
        case "alias":
            return "registry";
        case "file":
        case "directory":
            return "local";
        case "remote":
        case "git":
            return pkgType;
        default:
            return badPackageType(pkgType);
    }
}

export function trySpecs(specBase: string, adaptVersion: SemVer): SpecInfo[] {
    const specs: SpecInfo[] = [];
    let pkgInfo: pkgArg.Result | undefined;
    let type: SpecInfo["type"] | undefined;

    if (isLocalSpec(specBase)) type = "local";

    try {
        pkgInfo = pkgArg(specBase);
    } catch (err) { /* */ }

    if (type !== "local") {
        const versions = tryVersions(adaptVersion);

        if (mightBeGallerySpec(specBase)) {
            const base = galleryUrl(specBase);
            [ ...versions, undefined ].forEach((v) => specs.push({
                base,
                complete: galleryUrl(specBase, v),
                type: "git",
            }));
        }

        if (pkgInfo) {
            type = toSpecInfoType(pkgInfo.type);

            // npm: Add adapt version labels iff no version/range/tag given
            if (mightBeNpmPackage(pkgInfo) && pkgInfo.rawSpec === "") {
                versions.forEach((v) => specs.push({
                    base: specBase,
                    complete: `${specBase}@${v}`,
                    type: "registry",
                }));
            }

            // git: Add adapt version label iff no committish/range was given
            if (pkgInfo.type === "git" && !pkgInfo.gitCommittish && !pkgInfo.gitRange) {
                versions.forEach((v) => specs.push({
                    base: specBase,
                    complete: `${specBase}#${v}`,
                    type: "git",
                }));
            }
        }
    }

    if (!type) throw new Error(`Spec type not set for spec base '${specBase}'`);

    specs.push({
        base: specBase,
        complete: specBase,
        type,
    });

    return specs;
}

const gitBaseSpecErrs = [
    /fatal: Authentication failed/,
    /fatal: unable to access .* Could not resolve host/,
    /fatal: repository .* not found/,
    /fatal: Could not read from remote repository/,
];

/**
 * This function's purpose is to help save time by not attempting to fetch any
 * more specs that we know will fail, based on info from the passed in `err`.
 * @returns true when `err` indicates a problem with
 * the base spec (e.g. a git repo that doesn't exist) rather than the
 * complete spec (e.g. the repo exists but the requested tag does not).
 */
function isErrorWithBaseSpec(info: SpecInfo, err: Error & { [key: string ]: any}) {
    switch (info.type) {
        case "git":
            if (err.isOperational) {
                for (const re of gitBaseSpecErrs) {
                    if (re.test(err.message)) return true;
                }
            }
            break;

        case "registry":
            if (err.statusCode === 404) return true;
            break;
    }
    return false;
}
