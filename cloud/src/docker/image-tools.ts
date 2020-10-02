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
import { fetchToCache } from "@adpt/utils";
import execa from "execa";
import path from "path";
import { cmdId, debug, debugOut, streamToDebug } from "./cli";
import { ImageIdString, ImageNameString, NameTagString } from "./types";

const craneVersion = "v0.1.3";

function cranePlatform() {
    switch (process.platform) {
        case "darwin":
            return "Darwin";
        case "linux":
            return "Linux";
        case "win32":
            // TODO: No release is published, but building from source on
            // Windows seems to work fine.
            // Waiting for https://github.com/google/go-containerregistry/pull/780
        default:
            throw new Error(`Platform ${process.platform} unsupported by crane releases`);
    }
}

function craneArch() {
    switch (process.arch) {
        case "x64":
            return "x86_64";
        case "x32":
            return "i386";
        default:
            throw new Error(`CPU architecture ${process.arch} unsupported by crane releases`);
    }
}

async function cranePath() {
    const url = `https://github.com/google/go-containerregistry/releases/download/${craneVersion}/go-containerregistry_${cranePlatform()}_${craneArch()}.tar.gz`;
    let filename = "crane";
    if (process.platform === "win32") filename += ".exe";

    const { dir } = await fetchToCache({
        name: "crane",
        untar: true,
        url,
        version: craneVersion,
        fileList: [ filename ],
    });
    return path.join(dir, filename);
}

/** @internal */
export async function execCrane(args: string[]) {
    const crane = await cranePath();

    const cmdDebug =
        debugOut.enabled ? debugOut.extend((cmdId()).toString()) :
            debug.enabled ? debug :
                null;
    if (cmdDebug) cmdDebug(`Running: ${crane} ${args.join(" ")}`);
    try {
        const ret = execa(crane, args, { all: true });
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

export async function registryDelete(nameTag: NameTagString) {
    await execCrane(["delete", nameTag]);
}

export async function registryImageId(nameTag: NameTagString): Promise<ImageIdString> {
    const { stdout } = await execCrane(["manifest", nameTag]);
    let manifest: any;
    try {
        manifest = JSON.parse(stdout);
    } catch (err) {
        throw new Error(`Unable to parse JSON output from 'crane manifest '${nameTag}': ${err.message}`);
    }

    const id = manifest && manifest.config && manifest.config.digest;
    if (!id || typeof id !== "string") {
        throw new Error(`Cannot get image ID for '${nameTag}': Unable to find config.digest`);
    }

    return id;
}

export interface RegistryTagOptions {
    existing: ImageNameString;
    newTag: NameTagString;
}

export async function registryTag({ existing, newTag }: RegistryTagOptions) {
    await execCrane(["tag", existing, newTag]);
}
