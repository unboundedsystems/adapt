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

import { createWriteStream, ensureDir, pathExists, rename, writeFile } from "fs-extra";
import fetch, { Response } from "node-fetch";
import pDefer from "p-defer";
import path from "path";
import tar from "tar";
import { URL } from "url";
import { sha256hex } from "./crypto";
import { InternalError } from "./internal_error";
import { xdgCacheDir } from "./xdg";

export interface FetchToCacheCommon {
    /** Short human-friendly name for this download. Used in local path. */
    name: string;
    /** URL to fetch file from */
    url: string;
    /**
     * A human-friendly string describing the version of the file, used in local
     * path.
     */
    version?: string;
}

export interface FetchToCacheFileOptions extends FetchToCacheCommon {
    /**
     * Name of the file on local disk.
     * @defaultValue Last path component from URL
     */
    file?: string;
    /** Mode (permissions) for the local file. */
    mode?: number;
}

export interface FetchToCacheTarOptions extends FetchToCacheCommon {
    tarOptions?: tar.ExtractOptions;
    fileList?: string[];
    untar: true;
}

type FetchToCacheOptions = FetchToCacheFileOptions | FetchToCacheTarOptions;

function isFileOptions(opt: FetchToCacheOptions): opt is FetchToCacheFileOptions {
    return (opt as FetchToCacheTarOptions).untar !== true;
}

export interface CachedFile {
    file: string;
    dir: string;
}

export interface CachedDir {
    dir: string;
}

type CachePromise = pDefer.DeferredPromise<CachedFile | CachedDir>;

const cacheMap = new Map<string, CachePromise>();

interface CacheKey {
    name: string;
    url: string;
    version?: string;
}
const cacheKey = ({ name, url, version }: CacheKey) => `${name}-${version}-${url}`;

/**
 * Fetches a file to the cache and returns the path once fetch is complete.
 *
 * @remarks
 * A directory is created that is unique to the URL to be fetched. The file
 * is downloaded into the directory and the directory can also be used for
 * storage of additional items related to this specific URL. For example,
 * this is useful when the fetched file is a multi-file archive. The archive
 * can be unpacked into the directory.
 *
 * @returns The path to the fetched file and path to the unique directory for
 * this URL.
 * @beta
 */
export async function fetchToCache(options: FetchToCacheFileOptions): Promise<CachedFile>;
export async function fetchToCache(options: FetchToCacheTarOptions): Promise<CachedDir>;
export async function fetchToCache(options: FetchToCacheOptions): Promise<CachedFile | CachedDir> {
    const key = cacheKey(options);
    const { name, url, version } = options;
    const entry = cacheMap.get(key);
    if (entry) return entry.promise;

    const deferred = pDefer<CachedFile | CachedDir>();
    cacheMap.set(key, deferred);

    try {
        const toolsCacheBase = path.join(xdgCacheDir(), "tools");

        const sha = sha256hex(url).slice(0, 5);
        const tag = version ? `${version}-${sha}` : sha;

        const dir = path.join(toolsCacheBase, name, tag);
        const complete = path.join(dir, ".complete");
        let file: string | undefined;

        if (isFileOptions(options)) {
            const urlObj = new URL(url);
            const baseName = options.file || urlObj.pathname.split("/").slice(-1)[0];
            if (!baseName) {
                throw new Error(
                    `Cannot determine a local file name to use for fetching ${name}. ` +
                    `Use the 'file' option.`);
            }
            file = path.join(dir, baseName);
        }

        // TODO: With multiple processes, they can race and both attempt
        // a download at the same time. Use proper-lockfile to serialize
        // access and provide liveliness check to recover from an aborted
        // download.
        if (!(await pathExists(complete))) {

            await ensureDir(dir, 0o700);

            const response = await fetch(url);
            if (response.status !== 200) throw new Error(`Could not get ${name} from ${url}: ${response.statusText}`);

            if (isFileOptions(options)) {
                if (!file) throw new InternalError(`file cannot be null`);
                await downloadFile(file, response, options);
            } else {
                await downloadTar(dir, response, options);
            }

            await writeFile(complete, "");
        }
        deferred.resolve({ dir, file });

    } catch (err) {
        deferred.reject(err);
    }

    return deferred.promise;
}

async function downloadFile(file: string, response: Response, options: FetchToCacheFileOptions) {
    const mode = options.mode != null ? options.mode : 0o500;

    // If another process has a download in progress, don't allow
    // us to corrupt it (flags: "wx").
    // TODO: If a previous fetch was aborted and left this file,
    // this will always fail until the download file is manually
    // deleted. See above TODO for fix.
    const fileStream = createWriteStream(`${file}.download`, { mode, flags: "wx" });
    await waitForStreams(response.body, fileStream, options);
    // Only allow a completed file to occupy the 'file' path
    await rename(`${file}.download`, file);
}

async function downloadTar(dir: string, response: Response, options: FetchToCacheTarOptions) {
    const tarOptions = {
        ...(options.tarOptions || {}),
        cwd: dir,
    };
    const tarStream = tar.extract(tarOptions || {}, options.fileList);
    await waitForStreams(response.body, tarStream, options);
}

async function waitForStreams(from: NodeJS.ReadableStream, to: NodeJS.WritableStream,
    { name, url }: FetchToCacheCommon) {
    return new Promise((res, rej) => {
        let err: any;
        to.on("close", res);
        to.on("error", (e) => {
            if (!err) {
                rej(e);
                err = e;
            } else {
                // tslint:disable-next-line: no-console
                console.error(`Unhandled error while writing ${name} from ${url}:`, e);
            }
        });
        from.on("error", (e) => {
            if (!err) {
                rej(e);
                err = e;
            } else {
                // tslint:disable-next-line: no-console
                console.error(`Unhandled error downloading ${name} from ${url}:`, e);
            }
        });
        from.pipe(to);
    });
}
