import { ensureError, InternalError, mkdtmp, UserError } from "@adpt/utils";
import copy from "copy";
import db from "debug";
import execa from "execa";
import fs from "fs-extra";
import json5 from "json5";
import { isArray, isObject, isString } from "lodash";
import pacote from "pacote";
import path from "path";
import escape from "shell-escape";
import { isLocal } from "../utils";

const debugNew = db("adapt:project:new");

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

export interface StarterConfig {
    files?: string[];
    init?: string;
    name?: string;
    version?: string;
}

const stringProps = [
    "init",
    "name",
    "version",
];

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

export function createStarter(spec: string, dest: string, args: string[]): AdaptStarter {
    return new AdaptStarterImpl(spec, dest, args);
}

class AdaptStarterImpl {
    readonly isLocal: boolean;

    protected starterDir_?: string;
    protected tmpDir_?: string;
    protected rmDir?: () => Promise<void>;

    constructor(readonly spec: string, readonly dest: string, readonly args: string[]) {
        this.isLocal = isLocal(spec);
    }

    async init() {
        this.starterDir_ = await this.localDir() || await this.mkTmp();
    }

    async download(log: LogString) {
        const cache = path.join(this.tmpDir, "cache");
        await fs.ensureDir(cache);

        const specs: string[] = [];
        const opts: pacote.Options = { cache };
        if (debugNew.enabled) opts.log = pacoteLog;

        if (mightBeGallerySpec(this.spec)) specs.push(galleryUrl(this.spec));
        specs.push(this.spec);

        do {
            const spec = specs.shift();
            if (!spec) throw new InternalError(`empty spec list`);

            try {
                log(`Trying ${spec}`);
                await pacote.extract(spec, this.starterDir, opts);
                return;

            } catch (err) {
                err = ensureError(err);
                if (err.code === "ENOENT" && err.path === path.join(this.starterDir, "package.json")) {
                    // SUCCESS. We don't require a package.json
                    return;
                }
                if (specs.length === 0) throw new SpecError(spec, err.message);
            }
        } while (true);
    }

    async run(log: LogString) {
        try {
            log(`Validating starter config`);
            const config = await validateConfig(this.starterDir);

            await fs.ensureDir(this.dest);
            await copyFiles(config, log, this.starterDir, this.dest);
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

async function validateConfig(starterDir: string): Promise<StarterConfig> {
    let config: any;
    try {
        const configJson = await fs.readFile(path.join(starterDir, starterJsonFile));
        config = json5.parse(configJson.toString());
    } catch (err) {
        err = ensureError(err);
        const msg = err.code === "ENOENT" ? `no ${starterJsonFile} file found` :
            err.name === "SyntaxError" ? `unable to parse ${starterJsonFile}:` +
                err.message.replace(/^JSON5:/, "") :
            err.message;
        throw new Error(msg);
    }

    if (!isObject(config)) {
        throw new Error(`${starterJsonFile} must contain a single object`);
    }
    stringProps.forEach((p) => checkString(config, p));

    if ("files" in config) {
        const files = config.files;
        if (!isArray(files)) {
            throw new Error(`${starterJsonFile}: 'files' must be an array`);
        }
        files.forEach((f, i) => {
            if (!isString(f)) {
                throw new Error(`${starterJsonFile}: 'files[${i}]' contains non-string value`);
            }
        });
    }
    return config;
}

async function copyFiles(config: StarterConfig, log: LogString,
    starterDir: string, dest: string) {

    if (!config.files) return;

    const opts: any = {
        overwrite: false,
        cwd: starterDir,
        srcBase: starterDir,
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
        const ret = await execa(cmd, { cwd: dest, env, shell: true });
        debugNew(`Init script stdout:\n${ret.stdout}\nInit script stderr:\n${ret.stderr}`);

    } catch (err) {
        throw new UserError(`Error running init script:\n${err.message}`);
    }
}

function mightBeGallerySpec(spec: string) {
    return ! /[:/]/.test(spec);
}

function galleryUrl(spec: string) {
    return `git+https://gitlab.com/adpt/starters/${spec}`;
}

async function fileType(filename: string): Promise<"FILE" | "DIR" | false> {
    try {
        const stat = await fs.stat(filename);
        return stat.isDirectory() ? "DIR" : "FILE";
    } catch (err) {
        return false;
    }
}
