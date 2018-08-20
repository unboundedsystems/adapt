import * as fs from "fs-extra";
import { padStart } from "lodash";
import * as moment from "moment";
import JsonDB = require("node-json-db");
import * as path from "path";

import { HistoryEntry, HistoryName, HistoryStore, HistoryWriter } from "./history";

// These are exported only for testing
export const domFilename = "adapt_dom.xml";
export const stateFilename = "adapt_state.json";
export const infoFilename = "adapt_deploy.json";

interface DirInfo {
    stateDirs: string[];
}

type AsyncAction = () => Promise<void>;

class LocalHistoryStore implements HistoryStore {
    constructor(
        private db: JsonDB,
        private dbPath: string,
        private rootDir: string,
    ) {}

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

    async appendState(toStore: HistoryEntry): Promise<AsyncAction[]> {
        const { domXml, stateJson, ...info } = toStore;
        const revertActions: AsyncAction[] = [];

        const dirName = await this.nextDirName();
        const dirPath = path.join(this.rootDir, dirName);

        await fs.outputFile(path.join(dirPath, domFilename), domXml);
        await fs.outputFile(path.join(dirPath, stateFilename), stateJson);
        await fs.outputJson(path.join(dirPath, infoFilename), info);

        this.db.push(this.dbPath + "/stateDirs[]", dirName);
        revertActions.push(() => this.remove(dirName));

        return revertActions;
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
        const info = await fs.readJson(path.join(dirName, infoFilename));

        return {
            domXml: domXml.toString(),
            stateJson: stateJson.toString(),
            fileName: info.fileName,
            projectRoot: info.projectRoot,
            stackName: info.stackName,
        };
    }

    async writer(): Promise<HistoryWriter> {
        return new LocalHistoryWriter(this);
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

class LocalHistoryWriter implements HistoryWriter {
    private revertActions: AsyncAction[] = [];

    constructor(private store: LocalHistoryStore) {}

    async appendEntry(toStore: HistoryEntry): Promise<void> {
        const reverts = await this.store.appendState(toStore);
        this.revertActions.push(...reverts);
    }

    async revert(): Promise<void> {
        const errors: any[] = [];

        while (true) {
            const act = this.revertActions.pop();
            if (act === undefined) break;
            try {
                await act();
            } catch (err) {
                errors.push(err);
            }
        }
        if (errors.length !== 0) {
            let i = 1;
            const msg = errors.map((e) => `  ${i++}) ${e}`).join("\n");
            throw new Error(`Errors occurred while reverting deployment history:\n${msg}`);
        }
    }
}
