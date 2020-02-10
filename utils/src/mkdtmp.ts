/*
 * Copyright 2018-2019 Unbounded Systems, LLC
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

import * as fs from "fs-extra";
import * as os from "os";
import * as path from "path";
import { onExit } from "./exit";

export interface MkdtmpPromise extends Promise<string> {
    remove(): Promise<void>;
}

export function mkdtmp(prefix: string, basedir = os.tmpdir()): MkdtmpPromise {
    let newDir: string | undefined;
    let removeOnExit: () => void | undefined;

    const retP = fs.mkdtemp(path.join(basedir, prefix + "-"))
        .then((dir) => {
            newDir = dir;
            removeOnExit = onExit(remove);
            return newDir;
        });
    // tslint:disable-next-line:prefer-object-spread
    return Object.assign(retP, { remove });

    async function remove() {
        if (newDir) await fs.remove(newDir);
        if (removeOnExit) removeOnExit();
    }
}

export interface WithTmpDirOpts {
    prefix?: string;
    basedir?: string;
}

const withTmpDirDefaults = {
    prefix: "tmp",
    basedir: os.tmpdir(),
};

export async function withTmpDir<T>(
    f: (tmpDir: string) => Promise<T> | T,
    options: WithTmpDirOpts = {}): Promise<T> {

    const { basedir, prefix } = { ...withTmpDirDefaults, ...options };

    const tmpDirP = mkdtmp(prefix, basedir);
    try {
        const tmpDir = await tmpDirP;
        return await f(tmpDir);
    } finally {
        await tmpDirP.remove();
    }
}
