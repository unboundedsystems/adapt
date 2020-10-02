/*
 * Copyright 2020 Unbounded Systems, LLC
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
import { ensureError, fetchToCache, InternalError, withTmpDir } from "@adpt/utils";
import execa, { Options as ExecaOptions } from "execa";
import fs from "fs-extra";
import { flatten, pick } from "lodash";
import path from "path";
import { Environment, mergeEnvPairs, mergeEnvSimple } from "../env";
import { BuildKitBuildOptions, BuildKitGlobalOptions, BuildKitOutput, ImageStorage, isBuildKitOutputRegistry } from "./bk-types";
import { cmdId, createTag, debug, debugOut, streamToDebug, writeFiles } from "./cli";
import { registryDelete, registryImageId, registryTag } from "./image-tools";
import { adaptDockerDeployIDKey } from "./labels";
import { File, ImageInfo, ImageNameString } from "./types";

export const pickBuildKitGlobals = (opts: BuildKitGlobalOptions): BuildKitGlobalOptions =>
    pick(opts, "buildKitHost");

const buildKitVersion = "v0.7.2";

function buildKitPlatform() {
    switch (process.platform) {
        case "darwin":
        case "linux":
            return process.platform;
        case "win32":
            return "windows";
        default:
            throw new Error(`Platform ${process.platform} unsupported by BuildKit releases`);
    }
}

function buildKitArch() {
    switch (process.arch) {
        case "arm64":
        case "s390x":
            return process.arch;
        case "x64":
            return "amd64";
        case "arm":
            return "arm-v7";
        case "ppc64":
            return "ppc64le";
        default:
            throw new Error(`CPU architecture ${process.arch} unsupported by BuildKit releases`);
    }
}

async function buildctlPath() {
    const url = `https://github.com/moby/buildkit/releases/download/${buildKitVersion}/buildkit-${buildKitVersion}.${buildKitPlatform()}-${buildKitArch()}.tar.gz`;
    let filename = "buildctl";
    if (process.platform === "win32") filename += ".exe";

    const { dir } = await fetchToCache({
        name: "buildkit",
        untar: true,
        url,
        version: buildKitVersion,
        fileList: [ `bin/${filename}` ],
        tarOptions: {
            strip: 1,
        },
    });
    return path.join(dir, filename);
}

interface OutputInfo {
    args: string[];
    nameTag: ImageNameString;
    hasTag: boolean;
    repo: string;
}

function outputInfo(output: BuildKitOutput): OutputInfo {
    const { imageName, imageTag, uniqueTag = false } = output;
    let repo = imageName;
    let nameTag = imageName;
    // When we're generating a unique tag, wait to add any tag
    const hasTag = Boolean(imageTag) && !uniqueTag;
    if (hasTag) nameTag += `:${imageTag}`;

    if (isBuildKitOutputRegistry(output)) {
        repo = `${output.registry}/${repo}`;
        nameTag = `${output.registry}/${nameTag}`;
        const params = [
            "type=image",
            "push=true",
            `name=${nameTag}`,
        ];
        if (!hasTag) params.push(`push-by-digest=true`);
        if (output.insecure) params.push(`registry.insecure=true`);

        return {
            args: ["--output", params.join(",")],
            hasTag,
            nameTag,
            repo,
        };
    }
    throw new Error(`BuildKit output type not supported`);
}

const defaultBuildKitBuildOptions = {
    frontend: "dockerfile.v0",
};

export async function buildKitBuild(
    dockerfile: string,
    contextPath: string,
    output: BuildKitOutput,
    options: BuildKitBuildOptions = {}): Promise<ImageInfo> {

    const opts = { ...defaultBuildKitBuildOptions, ...options };
    const { imageName, imageTag, prevUniqueTag, uniqueTag = false } = output;
    dockerfile = path.resolve(dockerfile);

    const args = [
        "build",
        "--frontend", opts.frontend,
        "--local", `context=${path.resolve(contextPath)}`,
        // This is actually the context dir for the dockerfile
        "--local", `dockerfile=${path.dirname(dockerfile)}`,
        "--opt", `filename=${path.basename(dockerfile)}`,
        "--progress", "plain",
    ];

    if (uniqueTag && !imageName) {
        throw new Error(`buildKitBuild: imageName must be set if uniqueTag is true`);
    }
    const info = outputInfo(output);

    if (opts.deployID) {
        args.push("--opt", `label:${adaptDockerDeployIDKey}=${opts.deployID}`);
    }
    args.push(...collectBuildArgs(opts));
    args.push(...info.args);

    const cmdRet = await execBuildKit(args, opts);
    const { stderr } = cmdRet;
    // if (debug.enabled) debugBuild(cmdRet);

    const { id, digest } = idFromBuild(stderr);
    const ret: ImageInfo = {
        id,
        digest: `${info.repo}@${digest}`,
        nameTag: info.nameTag,
    };
    if (!ret.digest) throw new InternalError(`ret.digest should not be null`);

    if (uniqueTag) {
        const prevId = prevUniqueTag && await registryImageId(prevUniqueTag);
        // TODO: Should this also confirm that registry has not changed?
        if (prevId === id) {
            ret.nameTag = prevUniqueTag; // prev points to current id
        } else {
            const newTag = createTag(imageTag, uniqueTag);
            if (!newTag) throw new InternalError(`newTag should not be null`);
            ret.nameTag += `:${newTag}`;
            await registryTag({ existing: ret.digest, newTag });
        }
    } else if (!info.hasTag) {
        ret.nameTag = ret.digest;
    }

    return ret;
}

function collectBuildArgs(opts: BuildKitBuildOptions): string[] {
    const buildArgs = mergeEnvPairs(opts.buildArgs);
    if (!buildArgs) return [];
    const expanded = buildArgs.map((e) => ["--opt", `build-arg:${e.name}=${e.value}`]);
    return flatten(expanded);
}

const digestRe = /exporting manifest (sha\d+:[0-9a-f]+) .*?done/m;
const idRe = /exporting config (sha\d+:[0-9a-f]+) .*?done/m;

function idFromBuild(stderr: string) {
    let m = stderr.match(digestRe);
    const digest = m && m[1];

    m = stderr.match(idRe);
    const id = m && m[1];

    if (!id) throw new Error("Could not extract image ID from BuildKit output\n" + stderr);
    if (!digest) throw new Error("Could not extract image digest from BuildKit output\n" + stderr);
    return { digest, id };
}

interface ExecBuildKitOptions extends BuildKitGlobalOptions {
    env?: Environment;
}

/** @internal */
export async function execBuildKit(args: string[], options: ExecBuildKitOptions) {
    const globalArgs = [];
    if (options.buildKitHost) globalArgs.push("--addr", options.buildKitHost);

    const env = mergeEnvSimple(options.env) || {};

    args = globalArgs.concat(args);
    const execaOpts: ExecaOptions = {
        all: true,
        env,
    };
    const buildctl = await buildctlPath();

    const cmdDebug =
        debugOut.enabled ? debugOut.extend((cmdId()).toString()) :
            debug.enabled ? debug :
                null;
    if (cmdDebug) cmdDebug(`Running: ${buildctl} ${args.join(" ")}`);
    try {
        const ret = execa(buildctl, args, execaOpts);
        if (debugOut.enabled && cmdDebug) {
            streamToDebug(ret.stdout, cmdDebug);
            streamToDebug(ret.stderr, cmdDebug);
        }
        return await ret;
    } catch (e) {
        if (e.all) e.message = `${e.shortMessage}\n${e.all}`;
        throw e;
    }
}

/*
 * Staged build utilities
 */

export interface BuildKitFilesImageOptions extends BuildKitGlobalOptions {
    /**
     * If set, adds a Docker LABEL to the built image with the DeployID.
     */
    deployID?: string;
    /**
     * Describes where to store the image.
     */
    storage: ImageStorage;
}

export async function buildKitFilesImage(files: File[], options: BuildKitFilesImageOptions) {
    const { storage, ...opts } = options;
    const dockerfile = `
        FROM scratch
        COPY . /
        `;
    return withTmpDir(async (dir) => {
        const dockerfileName = path.join(dir, "adapt_temp.Dockerfile");
        await writeFiles(dir, files);
        await fs.writeFile(dockerfileName, dockerfile);
        return buildKitBuild(dockerfileName, dir, {
            ...storage,
            imageName: "adapt-tmp-files",
            uniqueTag: true,
        }, {
            ...pickBuildKitGlobals(opts),
            deployID: opts.deployID,
        });
    }, { prefix: "adapt-buildkit-build" });
}

export async function withBuildKitFilesImage<T>(files: File[] | undefined,
    opts: BuildKitFilesImageOptions,
    fn: (img: ImageInfo | undefined) => T | Promise<T>): Promise<T> {

    if (!files || files.length === 0) return fn(undefined);

    const image = await buildKitFilesImage(files, opts);
    const { digest } = image;
    if (!digest) throw new InternalError(`buildKitFilesImage did not create a digest`);

    try {
        return await fn(image);
    } finally {
        try {
            await registryDelete(digest);
        } catch (err) {
            if (!err.stderr || !/UNSUPPORTED/.test(err.stderr)) {
                err = ensureError(err);
                // tslint:disable-next-line: no-console
                console.warn(`Unable to delete temporary Docker image: `, err.message);
            }
        }
    }
}
