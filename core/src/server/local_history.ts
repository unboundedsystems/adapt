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

import { UserError } from "@adpt/utils";
import * as fs from "fs-extra";
import { padStart } from "lodash";
import moment from "moment";
import { JsonDB } from "node-json-db";
import * as path from "path";

import { lock } from "../utils/lockfile";
import { HistoryEntry, HistoryName, HistoryStatus, HistoryStore, isHistoryStatus, isStatusComplete } from "./history";

// These are exported only for testing
export const dataDirName = "dataDir";
export const dependenciesFilename = "adapt_dependencies.json";
export const domFilename = "adapt_dom.xml";
export const stateFilename = "adapt_state.json";
export const observationsFilename = "adapt_observations.json";
export const infoFilename = "adapt_deploy.json";

interface DirInfo {
    stateDirs: string[];
}

// Example dirName: 00000-preAct-2018-11-15T22:20:46+00:00
const dirNameRegEx = /^(\d{5})-([^-]+)-(.*)$/;

function dirStatus(dirName: string): HistoryStatus {
    const m = dirName.match(dirNameRegEx);
    if (m) {
        const status = m[2];
        if (isHistoryStatus(status)) return status;
    }
    throw new Error(`History directory '${dirName}' unrecognized format`);
}

function dirStatusMatches(dirName: string, expected: HistoryStatus | undefined) {
    if (expected === undefined) return true;
    const status = dirStatus(dirName);

    if (expected === HistoryStatus.complete) return isStatusComplete(status);
    else return dirStatus(dirName) === expected;
}

class LocalHistoryStore implements HistoryStore {
    dataDir: string;
    dataDirRelease?: () => Promise<void>;

    constructor(
        private db: JsonDB,
        private dbPath: string,
        private rootDir: string,
    ) {
        this.dataDir = path.join(rootDir, dataDirName + ".uncommitted");
    }

    async init(create: boolean) {
        let currentInfo: DirInfo;
        try {
            currentInfo = this.db.getData(this.dbPath);
        } catch (err) {
            if (err.name !== "DataError") throw err;

            if (!create) throw new Error(`History store does not exist`);

            currentInfo = {
                stateDirs: [],
            };
            this.db.push(this.dbPath, currentInfo);
        }

        await fs.ensureDir(this.rootDir);
    }

    async destroy() {
        await this.releaseDataDir();
        try {
            this.db.delete(this.dbPath);
        } catch (err) { /**/ }
        try {
            await fs.remove(this.rootDir);
        } catch (err) { /**/ }
    }

    async commitEntry(toStore: HistoryEntry): Promise<void> {
        const { dependenciesJson, domXml, stateJson, observationsJson, ...info } = toStore;

        if (toStore.dataDir !== this.dataDir) {
            throw new Error(`Internal error: commiting invalid dataDir ` +
                `'${toStore.dataDir}'. Should be '${this.dataDir}'`);
        }

        const dirName = await this.nextDirName(toStore.status);
        const dirPath = path.join(this.rootDir, dirName);

        info.dataDir = path.join(dirPath, dataDirName);

        await fs.outputFile(path.join(dirPath, domFilename), domXml);
        await fs.outputFile(path.join(dirPath, stateFilename), stateJson);
        await fs.outputFile(path.join(dirPath, observationsFilename), observationsJson);
        await fs.outputFile(path.join(dirPath, dependenciesFilename), dependenciesJson);
        await fs.outputJson(path.join(dirPath, infoFilename), info);

        // If we're committing preAct, the directory remains in place and
        // locked; just snapshot it with a copy. Otherwise, we're done with it
        // and we can move it and unlock it.
        if (toStore.status === HistoryStatus.preAct) {
            await fs.copy(this.dataDir, info.dataDir, {
                overwrite: false,
                errorOnExist: true,
                preserveTimestamps: true,
            });
        } else {
            await fs.move(this.dataDir, info.dataDir);
            await this.releaseDataDir();
        }

        this.db.push(this.dbPath + "/stateDirs[]", dirName, false /*override*/);
    }

    async last(withStatus?: HistoryStatus): Promise<HistoryEntry | undefined> {
        const lastDir = this.lastDir(withStatus);
        if (lastDir === undefined) return undefined;
        return this.historyEntry(lastDir);
    }

    async remove(historyName: HistoryName): Promise<void> {
        await fs.remove(historyName);
        const info = await this.getInfo();
        info.stateDirs = info.stateDirs.filter((d) => d !== historyName);
        await this.setInfo(info);
    }

    async historyEntry(historyName: HistoryName): Promise<HistoryEntry> {
        const dirName = path.join(this.rootDir, historyName);

        const domXml = await fs.readFile(path.join(dirName, domFilename));
        const stateJson = await fs.readFile(path.join(dirName, stateFilename));
        const observationsJson = await fs.readFile(path.join(dirName, observationsFilename));
        const info = await fs.readJson(path.join(dirName, infoFilename));

        let dependenciesJson = "{}";
        try {
            dependenciesJson = (await fs.readFile(path.join(dirName, dependenciesFilename))).toString();
        } catch (err) {
            if (err.code !== "ENOENT") throw err;
        }

        return {
            dependenciesJson,
            domXml: domXml.toString(),
            stateJson: stateJson.toString(),
            observationsJson: observationsJson.toString(),
            fileName: info.fileName,
            projectRoot: info.projectRoot,
            stackName: info.stackName,
            dataDir: info.dataDir,
            status: info.status,
        };
    }

    async getDataDir(withStatus: HistoryStatus): Promise<string> {
        if (this.dataDirRelease) {
            throw new Error(`Internal error: attempting to lock dataDir ` +
                `'${this.dataDir}' twice`);
        }
        // dataDir must exist in order to lock it.
        await fs.ensureDir(this.dataDir);
        try {
            this.dataDirRelease = await lock(this.dataDir, "Adapt server history lock");
        } catch (e) {
            throw new UserError(`Unable to get exclusive access to deployment ` +
                `directory. Please retry in a moment. [${e.message}]`);
        }

        // Ensure we start from the last committed state
        await fs.remove(this.dataDir);
        await fs.ensureDir(this.dataDir);
        const last = this.lastDir(withStatus);
        if (last) {
            await fs.copy(path.join(this.rootDir, last, dataDirName), this.dataDir, {
                preserveTimestamps: true,
            });
        }
        return this.dataDir;
    }

    async releaseDataDir(): Promise<void> {
        if (!this.dataDirRelease) return; // We don't hold the lock
        await fs.remove(this.dataDir);
        await this.dataDirRelease();
        this.dataDirRelease = undefined;
    }

    private async nextDirName(status: HistoryStatus): Promise<string> {
        const lastDir = this.lastDir();
        let nextSeq: number;

        if (lastDir === undefined) {
            nextSeq = 0;
        } else {
            const matches = lastDir.match(/^\d+/);
            if (matches == null) throw new Error(`stateDir entry '${lastDir}' is invalid`);
            const lastSeq = parseInt(matches[0], 10);

            if (status === HistoryStatus.preAct) {
                // Completely new entry
                nextSeq = lastSeq + 1;
            } else {
                if (dirStatus(lastDir) !== HistoryStatus.preAct) {
                    throw new Error(
                        `Unexpected status for last history entry. ` +
                        `(lastDir: ${lastDir}, status: ${status})`);
                }
                // Completion of the current entry
                nextSeq = lastSeq;
            }
        }
        const seqStr = padStart(nextSeq.toString(10), 5, "0");
        // Colons are invalid in paths on Windows
        const timestamp = moment().format().replace(/:/g, ".");

        return `${seqStr}-${status}-${timestamp}`;
    }

    private lastDir(withStatus?: HistoryStatus): string | undefined {
        try {
            // The array returned by getData is the actual object stored in the
            // DB. Make a copy.
            const dirList: string[] = this.db.getData(this.dbPath + "/stateDirs").slice();
            while (true) {
                const dir = dirList.pop();
                if (dir === undefined || dirStatusMatches(dir, withStatus)) return dir;
            }
        } catch (err) {
            if (err.name !== "DataError") throw err;
            return undefined;
        }
    }

    private async getInfo(): Promise<DirInfo> {
        return this.db.getData(this.dbPath);
    }
    private async setInfo(info: DirInfo): Promise<void> {
        return this.db.push(this.dbPath, info, true);
    }
}

export async function createLocalHistoryStore(
    db: JsonDB,
    dbPath: string,
    rootDir: string,
    create: boolean,
): Promise<HistoryStore> {
    const h = new LocalHistoryStore(db, dbPath, rootDir);
    await h.init(create);
    return h;
}
