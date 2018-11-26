import { inDebugger } from "@usys/utils";
import * as fs from "fs-extra";
import { padStart } from "lodash";
import moment from "moment";
import JsonDB from "node-json-db";
import * as path from "path";
import * as lockfile from "proper-lockfile";

import { HistoryEntry, HistoryName, HistoryStore } from "./history";

// These are exported only for testing
export const dataDirName = "dataDir";
export const domFilename = "adapt_dom.xml";
export const stateFilename = "adapt_state.json";
export const observationsFilename = "adapt_observations.json";
export const infoFilename = "adapt_deploy.json";

interface DirInfo {
    stateDirs: string[];
}

// 1 day if in the debugger, otherwise 10 sec
const lockStaleTime = inDebugger() ? 24 * 60 * 60 * 1000 : 10 * 1000;

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
        try {
            this.db.delete(this.dbPath);
        } catch (err) {
            // ignore
        }
        await fs.remove(this.rootDir);
    }

    async commitEntry(toStore: HistoryEntry): Promise<void> {
        const { domXml, stateJson, observationsJson, ...info } = toStore;

        if (toStore.dataDir !== this.dataDir) {
            throw new Error(`Internal error: commiting invalid dataDir ` +
                `'${toStore.dataDir}'. Should be '${this.dataDir}'`);
        }

        const dirName = await this.nextDirName();
        const dirPath = path.join(this.rootDir, dirName);

        info.dataDir = path.join(dirPath, dataDirName);

        await fs.outputFile(path.join(dirPath, domFilename), domXml);
        await fs.outputFile(path.join(dirPath, stateFilename), stateJson);
        await fs.outputFile(path.join(dirPath, observationsFilename), observationsJson);
        await fs.outputJson(path.join(dirPath, infoFilename), info);
        await fs.move(this.dataDir, path.join(dirPath, dataDirName));
        await this.releaseDataDir();

        this.db.push(this.dbPath + "/stateDirs[]", dirName);
    }

    async last(): Promise<HistoryEntry | undefined> {
        const lastDir = this.lastDir();
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

        return {
            domXml: domXml.toString(),
            stateJson: stateJson.toString(),
            observationsJson: observationsJson.toString(),
            fileName: info.fileName,
            projectRoot: info.projectRoot,
            stackName: info.stackName,
            dataDir: info.dataDir,
        };
    }

    async getDataDir(): Promise<string> {
        if (this.dataDirRelease) {
            throw new Error(`Internal error: attempting to lock dataDir ` +
                `'${this.dataDir}' twice`);
        }
        // dataDir must exist in order to lock it.
        await fs.ensureDir(this.dataDir);
        try {
            this.dataDirRelease = await lockfile.lock(this.dataDir, {
                retries: 2,
                stale: lockStaleTime,
            });
        } catch (e) {
            throw new Error(`Unable to get exclusive access to deployment ` +
                `directory '${this.dataDir}'. Please retry in a moment. ` +
                `[${e.message}]`);
        }

        // Ensure we start from the last committed state
        await fs.remove(this.dataDir);
        await fs.ensureDir(this.dataDir);
        const last = this.lastDir();
        if (last) {
            await fs.copy(path.join(this.rootDir, last, dataDirName), this.dataDir);
        }
        return this.dataDir;
    }

    async releaseDataDir(): Promise<void> {
        if (!this.dataDirRelease) return; // We don't hold the lock
        await fs.remove(this.dataDir);
        await this.dataDirRelease();
        this.dataDirRelease = undefined;
    }

    private async nextDirName(): Promise<string> {
        const lastDir = this.lastDir();
        let nextSeq: number;

        if (lastDir === undefined) {
            nextSeq = 0;
        } else {
            const matches = lastDir.match(/^\d+/);
            if (matches == null) throw new Error(`stateDir entry '${lastDir}' is invalid`);
            nextSeq = parseInt(matches[0], 10) + 1;
        }
        const seqStr = padStart(nextSeq.toString(10), 5, "0");
        const timestamp = moment().format();

        return `${seqStr}-${timestamp}`;
    }

    private lastDir(): string | undefined {
        let lastDir: string | undefined;
        try {
            lastDir = this.db.getData(this.dbPath + "/stateDirs[-1]");
        } catch (err) {
            if (err.name !== "DataError") throw err;
        }
        return lastDir;
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
