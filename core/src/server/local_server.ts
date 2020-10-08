/*
 * Copyright 2018-2020 Unbounded Systems, LLC
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

import { mapMap, UserError } from "@adpt/utils";
import * as fs from "fs-extra";
import { JsonDB } from "node-json-db";
import * as path from "path";
import { fileURLToPath, URL } from "url";

import { lock } from "../utils/lockfile";
import { HistoryStore } from "./history";
import { createLocalHistoryStore } from "./local_history";
import {
    $serverLock,
    AdaptServer,
    DeleteOptions,
    GetOptions,
    ServerLock,
    ServerOptions,
    ServerPathExists,
    SetOptions,
} from "./server";
import { Locker, ServerBase } from "./server_base";

export interface LocalServerOptions extends ServerOptions {
    init?: boolean;
}

export interface FileLock extends ServerLock {
    release: () => Promise<void>;
}

export class FileLocker implements Locker<FileLock> {
    constructor (public filename: string) {}

    async lock(): Promise<FileLock> {
        return {
            release: await lock(this.filename, "Adapt server lock"),
            [$serverLock]: true,
        };
    }

    async unlock(l: FileLock): Promise<void> {
        await l.release();
    }
}

// Exported for testing only
export const dbFilename = "adapt_local.json";

const defaultOptions = {
    init: false,
};

const currentVersion = 0;

const openDbs = new Map<string, JsonDB>();

export class LocalServer extends ServerBase<FileLock> implements AdaptServer {
    static urlMatch = /^file:/;
    private db: JsonDB;
    private rootDir: string;
    private filename: string;
    private options: LocalServerOptions;
    private historyStores: Map<string, HistoryStore>;
    private url: string;

    constructor(url: URL, options: Partial<LocalServerOptions>) {
        const pathname = fileURLToPath(url);
        const rootDir = path.resolve(pathname);
        const filename = path.join(rootDir, dbFilename);

        super(new FileLocker(filename));
        this.rootDir = rootDir;
        this.filename = filename;
        this.historyStores = new Map<string, HistoryStore>();
        this.options = {...defaultOptions, ...options};
        this.url = url.href;
    }

    async init(): Promise<void> {
        const alreadyOpen = openDbs.get(this.filename);
        if (alreadyOpen !== undefined) {
            this.db = alreadyOpen;
            return;
        }

        let rootStat: fs.Stats | undefined;
        try {
            rootStat = await fs.stat(this.rootDir);
        } catch (err) {
            if (err.code !== "ENOENT") throw err;
            // fall through
        }
        if (rootStat && !rootStat.isDirectory()) {
            return throwServerUrlError(this.url, `'${this.rootDir}' is not a directory`);
        }
        if (this.options.init === true && rootStat === undefined) {
            await fs.ensureDir(this.rootDir);
        }

        const exists = await fs.pathExists(this.filename);
        if (exists === false && this.options.init === false) {
            return throwServerUrlError(this.url, `'${dbFilename}' does not exist`);
        }

        // Creates file if none exists. Params are:
        // saveOnPush: true
        // humanReadable: true
        this.db = new JsonDB(this.filename, true, true);

        if (exists) {
            let ver: any = null;
            try {
                ver = this.db.getData("/adaptLocalServerVersion");
            } catch (err) {
                // fall through
            }
            if (ver !== currentVersion) {
                return throwServerUrlError(this.url,
                    `'${dbFilename}' is not a valid local server file (ver=${ver})`);
            }
        } else {
            this.db.push("/adaptLocalServerVersion", currentVersion);
        }
        openDbs.set(this.filename, this.db);
    }

    async destroy(): Promise<void> {
        const promises = mapMap(this.historyStores, (_, s) => s.destroy());
        await Promise.all(promises);
    }

    async set(dataPath: string, val: any, options: SetOptions = {}): Promise<void> {
        await this.withLock(options, async () => {
            this.db.reload();

            if (options.mustCreate) {
                try {
                    this.db.getData(dataPath);
                    throw new ServerPathExists(dataPath);
                } catch (err) {
                    if (err.name !== "DataError") throw err;
                }
            }

            this.db.push(dataPath, val);
        });
    }

    async get(dataPath: string, options: GetOptions = {}): Promise<any> {
        return this.withLock(options, () => {
            this.db.reload();
            return this.db.getData(dataPath);
        });
    }

    async delete(dataPath: string, options: DeleteOptions = {}): Promise<void> {
        await this.withLock(options, async () => {
            this.db.reload();
            this.db.delete(dataPath);
        });
    }

    async historyStore(dataPath: string, init: boolean): Promise<HistoryStore> {
        let store = this.historyStores.get(dataPath);
        if (store) return store;

        store = await createLocalHistoryStore(
            this.db, dataPath, path.join(this.rootDir, dataPath), init);

        const origDestroy = store.destroy;
        store.destroy = async () => {
            this.historyStores.delete(dataPath);
            await origDestroy.call(store);
        };

        this.historyStores.set(dataPath, store);
        return store;
    }

}

function throwServerUrlError(url: string, message: string) {
    throw new UserError(`Invalid Adapt Server URL '${url}': ${message}`);
}
