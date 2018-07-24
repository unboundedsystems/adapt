import * as fs from "fs-extra";
import { padStart } from "lodash";
import * as moment from "moment";
import * as path from "path";

export interface HistoryEntry {
    domXml: string;
    stateJson: string;
}

export interface StateHistory {
    revert(): Promise<void>;
    appendState(toStore: HistoryEntry): Promise<void>;
    lastState(): Promise<HistoryEntry>;
}

// These are exported only for testing
export const infoFilename = "adapt_state_history.json";
export const domFilename = "adapt_dom.xml";
export const stateFilename = "adapt_state.json";

const currentVersion = 1;

interface DirInfo {
    version: number;
    stateDirs: string[];
}

type AsyncAction = () => Promise<void>;

class StateHistoryDir {
    private infoPath: string;
    private origInfo?: DirInfo;
    private currentInfo?: DirInfo;
    private revertActions: AsyncAction[] = [];

    constructor(public rootDir: string) {
        this.infoPath = path.join(rootDir, infoFilename);
    }

    async initialize(create: boolean): Promise<void> {
        let msg: string | null = null;

        try {
            this.origInfo = await fs.readJson(this.infoPath);
            this.validateInfo(this.origInfo);
        } catch (err) {
            if (err.code === "ENOENT") {
                msg = `Directory '${this.rootDir}' is not a valid state history. ` +
                    `Control file '${this.infoPath}' does not exist`;
            } else {
                // TODO(mark): Enumerate the errors that we should handle to
                // give better user experience.
                throw err;
            }
        }
        if (this.origInfo) {
            this.currentInfo = this.origInfo;

        } else {
            if (!create) {
                if (!msg) msg = `Unable to open '${this.rootDir}': unknown reason`;
                throw new Error(msg);
            }
            try {
                await fs.mkdir(this.rootDir);
                this.revertActions.push(() => fs.rmdir(this.rootDir));
            } catch (err) {
                if (err.code !== "EEXIST") {
                    throw new Error(`Unable to create directory ` +
                                    `'${this.rootDir}': ${err}`);
                }
            }
            this.currentInfo = {
                version: currentVersion,
                stateDirs: []
            };

            try {
                // Test write
                await fs.writeJson(this.infoPath, this.currentInfo, {flag: "wx"});
                this.revertActions.push(() => fs.unlink(this.infoPath));
            } catch (err) {
                throw new Error(`Unable to initialize state history: ${err}`);
            }
        }
    }

    async revert(): Promise<void> {
        while (true) {
            const act = this.revertActions.pop();
            if (act === undefined) break;
            await act();
        }
    }

    async appendState(toStore: HistoryEntry): Promise<void> {
        if (this.currentInfo == null) throw new Error(`Internal error. StateHistoryDir not initialized properly.`);

        const { domXml, stateJson } = toStore;

        const dirName = this.nextDirName();
        const dirPath = path.join(this.rootDir, dirName);
        this.revertActions.push(() => fs.remove(dirPath));

        await fs.outputFile(path.join(dirPath, domFilename), domXml);
        await fs.outputFile(path.join(dirPath, stateFilename), stateJson);

        this.currentInfo.stateDirs.push(dirName);
        await fs.writeJson(this.infoPath, this.currentInfo, {spaces: 2});
    }

    async lastState(): Promise<HistoryEntry> {
        const info = this.getInfo();
        const len = info.stateDirs.length;
        if (len === 0) {
            return {
                domXml: "",
                stateJson: "{}",
            };
        }

        const last = info.stateDirs[len - 1];
        const dirName = path.join(this.rootDir, last);

        const domXml = await fs.readFile(path.join(dirName, domFilename));
        const stateJson = await fs.readFile(path.join(dirName, stateFilename));
        return {
            domXml: domXml.toString(),
            stateJson: stateJson.toString(),
        };
    }

    private validateInfo(val: any) {
        if (val == null || typeof val !== "object") {
            throw new Error(`Invalid state history JSON file`);
        }
        if (typeof val.version !== "number" || val.version !== currentVersion) {
            throw new Error(`State history JSON has invalid version`);
        }
        if (!Array.isArray(val.stateDirs)) {
            throw new Error(`State history JSON has invalid stateDirs`);
        }
    }

    private nextDirName(): string {
        const info = this.getInfo();

        let nextSeq: number;

        const len = info.stateDirs.length;
        if (len === 0) {
            nextSeq = 0;
        } else {
            const last = info.stateDirs[len - 1];
            const matches = last.match(/^\d+/);
            if (matches == null) throw new Error(`stateDir entry '${last}' is invalid`);
            nextSeq = parseInt(matches[0], 10) + 1;
        }
        const seqStr = padStart(nextSeq.toString(10), 5, "0");
        const timestamp = moment().format();

        return `${seqStr}-${timestamp}`;
    }

    private getInfo(): DirInfo {
        if (this.currentInfo == null) throw new Error(`Internal error. StateHistoryDir not initialized properly.`);
        return this.currentInfo;
    }
}

export async function createStateHistoryDir(rootDir: string, create: boolean):
    Promise<StateHistory> {

    const history = new StateHistoryDir(rootDir);
    await history.initialize(create);
    return history;
}
