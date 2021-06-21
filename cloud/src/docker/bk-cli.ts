/*
 * Copyright 2020-2021 Unbounded Systems, LLC
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
import { Options as ExecaOptions } from "execa";
import fs from "fs-extra";
import { flatten, pick } from "lodash";
import path from "path";
import { Environment, mergeEnvPairs, mergeEnvSimple } from "../env";
import { BuildKitBuildOptions, BuildKitGlobalOptions, BuildKitOutput, ImageStorage, isBuildKitOutputRegistry } from "./bk-types";
import { createTag, exec, writeFiles } from "./cli";
import { ImageRefRegistry, isImageRefRegistryWithId, mutableImageRef, MutableImageRef, WithId } from "./image-ref";
import { registryDelete, registryImageId, registryTag } from "./image-tools";
import { adaptDockerDeployIDKey } from "./labels";
import { File } from "./types";

export const pickBuildKitGlobals = (opts: BuildKitGlobalOptions): BuildKitGlobalOptions =>
    pick(opts, "buildKitHost");

const buildKitVersion = "v0.8.3";

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
    ref: MutableImageRef;
}

function outputInfo(output: BuildKitOutput): OutputInfo {
    const { imageName, imageTag, uniqueTag = false } = output;
    const ref = mutableImageRef({
        path: imageName,
    });
    // When we're generating a unique tag, wait to add any tag
    if (imageTag && !uniqueTag) {
        ref.tag = imageTag;
    }

    if (isBuildKitOutputRegistry(output)) {
        ref.domain = output.registry;
        const params = [
            "type=image",
            "push=true",
            `name=${ref.nameTag || ref.name}`,
        ];
        if (!ref.tag) params.push(`push-by-digest=true`);
        if (output.insecure) params.push(`registry.insecure=true`);

        return {
            args: ["--output", params.join(",")],
            ref,
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
    options: BuildKitBuildOptions = {}): Promise<WithId<ImageRefRegistry>> {

    const opts = { ...defaultBuildKitBuildOptions, ...options };
    const { imageName, imageTag, prevUniqueNameTag, uniqueTag = false } = output;
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
    const { args: oArgs, ref: mRef } = outputInfo(output);

    if (opts.deployID) {
        args.push("--opt", `label:${adaptDockerDeployIDKey}=${opts.deployID}`);
    }
    args.push(...collectBuildArgs(opts));
    args.push(...oArgs);

    const cmdRet = await execBuildKit(args, opts);
    const { stderr } = cmdRet;
    // if (debug.enabled) debugBuild(cmdRet);

    const { id, digest } = idFromBuild(stderr);
    mRef.id = id;
    mRef.digest = digest;
    if (!mRef.registryDigest) throw new InternalError(`ref.registryDigest should not be null`);

    if (uniqueTag) {
        let prevId: string | undefined;
        if (prevUniqueNameTag) {
            const prevRef = mutableImageRef();
            prevRef.nameTag = prevUniqueNameTag;
            // Since prevUniqueNameTag contains the registry, only allow reusing
            // it if the registry for the built image is the same.
            if (mRef.domain === prevRef.domain) {
                prevId = await registryImageId(prevUniqueNameTag);
            }
        }

        if (prevId === id) {
            mRef.nameTag = prevUniqueNameTag; // prev points to current id
        } else {
            const newTag = createTag(imageTag, uniqueTag);
            if (!newTag) throw new InternalError(`newTag should not be null`);
            mRef.tag = newTag;
            await registryTag({ existing: mRef.registryDigest, newTag });
        }
    }

    const final = mRef.freeze();
    if (!isImageRefRegistryWithId(final)) {
        throw new InternalError(`Built image reference '${final.ref}' is not ` +
            `a complete registry image with ID`);
    }
    return final;
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

    return exec(buildctl, args, execaOpts);
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
    fn: (img: ImageRefRegistry | undefined) => T | Promise<T>): Promise<T> {

    if (!files || files.length === 0) return fn(undefined);

    const image = await buildKitFilesImage(files, opts);
    const ref = image.registryTag || image.registryDigest;
    if (!ref) throw new InternalError(`buildKitFilesImage did not create a tag or digest`);

    try {
        return await fn(image);
    } finally {
        try {
            await registryDelete(ref);
        } catch (err) {
            if (!err.stderr || !/UNSUPPORTED/.test(err.stderr)) {
                err = ensureError(err);
                // tslint:disable-next-line: no-console
                console.warn(`Unable to delete temporary Docker image: `, err.message);
            }
        }
    }
}
