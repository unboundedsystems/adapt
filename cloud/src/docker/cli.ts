import { InternalError, withTmpDir } from "@adpt/utils";
import db from "debug";
import execa from "execa";
import fs from "fs-extra";
import ld from "lodash";
import * as path from "path";
import randomstring from "randomstring";
import { Readable } from "stream";
import {
    DockerBuildOptions,
    DockerGlobalOptions,
    File,
    ImageInfo,
} from "./types";

const debug = db("adapt:cloud:docker");
// Enable with DEBUG=adapt:cloud:docker:out*
const debugOut = db("adapt:cloud:docker:out");
let cmdId = 0;

// Should move to utils
function streamToDebug(s: Readable, d: db.IDebugger, prefix?: string) {
    prefix = prefix ? `[${prefix}] ` : "";
    s.on("data", (chunk) => d(prefix + chunk.toString()));
    s.on("error", (err) => debug(prefix, err));
}

export const pickGlobals = (opts: DockerGlobalOptions): DockerGlobalOptions =>
    ld.pick(opts, "dockerHost");

/*
 * Staged build utilities
 */

async function writeFiles(pwd: string, files: File[]) {
    // Strip any leading slash
    files = files.map((f) => {
        return f.path.startsWith("/") ?
            { path: f.path.slice(1), contents: f.contents } :
            f;
    });
    // Make any directories required
    const dirs = ld.uniq(files
        .map((f) => path.dirname(f.path))
        .filter((d) => d !== "."));
    await Promise.all(dirs.map(async (d) => fs.mkdirp(path.resolve(pwd, d))));

    await Promise.all(files.map(async (f) => {
        const contents = ld.isString(f.contents) ? Buffer.from(f.contents) : f.contents;
        return fs.writeFile(path.resolve(pwd, f.path), contents);
    }));
}

export async function buildFilesImage(files: File[], opts: DockerGlobalOptions) {
    const dockerfile = `
        FROM scratch
        COPY . /
        `;
    return withTmpDir(async (dir) => {
        await writeFiles(dir, files);
        return dockerBuild("-", dir, {
            ...pickGlobals(opts),
            forceRm: true,
            imageName: "adapt-tmp-files",
            uniqueTag: true,
            stdin: dockerfile,
        });
    }, { prefix: "adapt-docker-build" });
}

export async function withFilesImage<T>(files: File[] | undefined,
    opts: DockerGlobalOptions,
    fn: (img: ImageInfo | undefined) => T | Promise<T>): Promise<T> {

    if (!files || files.length === 0) return fn(undefined);

    const image = await buildFilesImage(files, opts);
    try {
        return await fn(image);
    } finally {
        await dockerRemoveImage(image.id, opts);
    }
}

export interface ExecDockerOptions extends DockerGlobalOptions {
    stdin?: string;
}

async function execDocker(args: string[], options: ExecDockerOptions) {
    const globalArgs = [];
    if (options.dockerHost) globalArgs.push("-H", options.dockerHost);

    args = globalArgs.concat(args);
    const opts = options.stdin ? { input: options.stdin } : undefined;

    const cmdDebug =
        debugOut.enabled ? debugOut.extend((++cmdId).toString()) :
            debug.enabled ? debug :
                null;
    if (cmdDebug) cmdDebug(`Running: ${"docker " + args.join(" ")}`);
    const ret = execa("docker", args, opts);
    if (debugOut.enabled && cmdDebug) {
        streamToDebug(ret.stdout, cmdDebug);
        streamToDebug(ret.stderr, cmdDebug);
    }

    return ret;
}

export const defaultDockerBuildOptions = {
    forceRm: true,
    uniqueTag: false,
};

export async function dockerBuild(
    dockerfile: string,
    contextPath: string,
    options: DockerBuildOptions = {}): Promise<ImageInfo> {

    const opts = { ...defaultDockerBuildOptions, ...options };
    let nameTag: string | undefined;

    const args = ["build", "-f", dockerfile];

    if (dockerfile === "-" && !opts.stdin) {
        throw new Error(`dockerBuild: stdin option must be set if dockerfile is "-"`);
    }

    if (opts.forceRm) args.push("--force-rm");
    if (opts.uniqueTag && !opts.imageName) {
        throw new Error(`dockerBuild: imageName must be set if uniqueTag is true`);
    }
    if (opts.imageName) {
        const tag = createTag(opts.imageTag, opts.uniqueTag);
        nameTag = tag ? `${opts.imageName}:${tag}` : opts.imageName;
        if (!opts.uniqueTag) args.push("-t", nameTag);
    }
    args.push(contextPath);

    const cmdRet = await execDocker(args, opts);
    const { stdout, stderr } = cmdRet;
    if (debug.enabled) debugBuild(cmdRet);

    const match = /^Successfully built ([0-9a-zA-Z]+)$/mg.exec(stdout);
    if (!match || !match[1]) throw new Error("Could not extract image sha\n" + stdout + "\n\n" + stderr);

    const id = await dockerImageId(match[1], opts);
    if (id == null) throw new Error(`Built image ID not found`);

    if (opts.uniqueTag) {
        const prevId = opts.prevUniqueTag && await dockerImageId(opts.prevUniqueTag, opts);
        if (prevId === id) nameTag = opts.prevUniqueTag; // prev points to current id
        else {
            if (!nameTag) throw new InternalError(`nameTag not set`);
            await dockerTag(id, nameTag, opts);
        }
    }

    const ret: ImageInfo = { id };
    if (nameTag) ret.nameTag = nameTag;
    return ret;
}

function debugBuild(cmdRet: execa.ExecaReturns) {
    const steps: string[] = [];
    let cur = "";
    cmdRet.stdout.split("\n").forEach((l) => {
        if (l.startsWith("Step")) {
            if (cur) steps.push(cur);
            cur = l;
        } else if (l.startsWith(" ---> ")) {
            cur += l;
        }
    });
    if (cur) steps.push(cur);
    const cached = cur.includes("Using cache");
    debug(`docker ${cmdRet.cmd}:\n  Cached: ${cached}\n  ${steps.join("\n  ")}`);
}

async function dockerImageId(name: string, opts: DockerGlobalOptions = {}): Promise<string | undefined> {
    const inspectRet = await execDocker(["inspect", name], opts);
    try {
        const inspect = JSON.parse(inspectRet.stdout);
        if (!Array.isArray(inspect)) throw new Error(`Image inspect result is not an array`);
        if (inspect.length > 1) throw new Error(`Multiple images found`);
        if (inspect.length === 0) return undefined;

        return inspect[0].Id;

    } catch (err) {
        throw new Error(`Error inspecting image ${name}: ${err.message}`);
    }
}

async function dockerTag(existing: string, newTag: string, opts: DockerGlobalOptions = {}) {
    return execDocker(["tag", existing, newTag], opts);
}

interface DockerRemoveImageOptions extends DockerGlobalOptions {
    force?: boolean;
}

const dockerRemoveImageDefaults = {
    force: false,
};

async function dockerRemoveImage(
    idOrNameTag: string, options: DockerRemoveImageOptions = {}) {

    const opts = { ...dockerRemoveImageDefaults, ...options };

    const args = ["rmi"];
    if (opts.force) args.push("--force");
    args.push(idOrNameTag);

    return execDocker(args, opts);
}

function createTag(baseTag: string | undefined, appendUnique: boolean): string | undefined {
    if (!baseTag && !appendUnique) return undefined;
    let tag = baseTag || "";
    if (baseTag && appendUnique) tag += "-";
    if (appendUnique) {
        tag += randomstring.generate({
            length: 8,
            charset: "alphabetic",
            readable: true,
            capitalization: "lowercase",
        });
    }
    return tag;
}
