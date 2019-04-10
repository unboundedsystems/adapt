import db from "debug";
import { get, has, set, unset } from "lodash";
import { CustomError } from "ts-custom-error";
import { createDeployment, Deployment } from "../../src/server/deployment";
import { HistoryEntry, HistoryName, HistoryStatus, HistoryStore } from "../../src/server/history";
import {
    AdaptServer,
    DeleteOptions,
    GetOptions,
    SetOptions,
} from "../../src/server/server";
import { ServerBase } from "../../src/server/server_base";

export class DataError extends CustomError {
    public constructor(message?: string) {
        super(message);
    }
}

const debugServer = db("adapt:server");

const mockDeploymentDefaults = {
    projectName: "mock",
    stackName: "mock",
};

export interface MockDeploymentOptions {
    deployID?: string;
    projectName?: string;
    stackName?: string;
}

export async function createMockDeployment(options: MockDeploymentOptions = {}): Promise<Deployment> {
    const opts = { ...mockDeploymentDefaults, ...options };
    const { projectName, stackName, deployID } = opts;
    const server = new MockServer();

    return createDeployment(server, projectName, stackName, { fixedDeployID: deployID });
}

const toLpath = (p: string) => {
    if (p[0] !== "/") throw new Error(`MockServer: Only absolute paths supported (${p})`);
    return p.slice(1).replace(RegExp("/", "g"), ".");
};

export class MockServer extends ServerBase implements AdaptServer {
    data = {};

    async init(): Promise<void> {/**/}
    async destroy(): Promise<void> {/**/}

    async set(dataPath: string, val: any, options: SetOptions = {}): Promise<void> {
        return this.withLock(options, async () => {
            const lpath = toLpath(dataPath);
            if (options && options.mustCreate === true && has(this.data, lpath)) {
                throw new Error(`Path '${dataPath}' already exists`);
            }
            debugServer(`SET ${options.lock ? "(L) " : ""}${dataPath} = ${val}`);
            set(this.data, lpath, val);
        });
    }
    async get(dataPath: string, options: GetOptions = {}): Promise<any> {
        return this.withLock(options, async () => {
            const lpath = toLpath(dataPath);
            if (!has(this.data, lpath)) throw new DataError(`Path '${dataPath}' not found`);

            const val = get(this.data, lpath);
            debugServer(`GET ${options.lock ? "(L) " : ""}${dataPath} = ${val}`);
            return val;
        });
    }
    async delete(dataPath: string, options: DeleteOptions = {}): Promise<void> {
        return this.withLock(options, async () => {
            const lpath = toLpath(dataPath);
            if (!has(this.data, lpath)) throw new DataError(`Path '${dataPath}' not found`);
            debugServer(`DEL ${options.lock ? "(L) " : ""}${dataPath}`);
            unset(this.data, lpath);
        });
    }
    async historyStore(dataPath: string, init: boolean): Promise<HistoryStore> {
        return new MockHistoryStore();
    }
}

export class MockHistoryStore implements HistoryStore {
    async commitEntry(toStore: HistoryEntry): Promise<void> {
        throw new Error(`Not implemented`);
    }
    async getDataDir(withStatus: HistoryStatus): Promise<string> {
        throw new Error(`Not implemented`);
    }
    // Release lock on dataDir without comitting
    async releaseDataDir(): Promise<void> {
        throw new Error(`Not implemented`);
    }
    // Read from history
    async historyEntry(historyName: HistoryName): Promise<HistoryEntry> {
        throw new Error(`Not implemented`);
    }
    async last(withStatus: HistoryStatus): Promise<HistoryEntry | undefined> {
        throw new Error(`Not implemented`);
    }
    // Destroy all history
    async destroy(): Promise<void> { /* */ }
}
