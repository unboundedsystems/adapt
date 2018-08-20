import * as fs from "fs-extra";
import JsonDB = require("node-json-db");
import * as path from "path";
import { URL } from "url";

import { HistoryStore } from "./history";
import { createLocalHistoryStore } from "./local_history";
import { AdaptServer, ServerOptions, SetOptions } from "./server";

export interface LocalServerOptions extends ServerOptions {
    init?: boolean;
}

// Exported for testing only
export const dbFilename = "adapt_local.json";

const defaultOptions = {
    init: false,
};

const currentVersion = 0;

const openDbs = new Map<string, JsonDB>();

export class LocalServer implements AdaptServer {
    static urlMatch = /^file:/;
    private db: JsonDB;
    private rootDir: string;
    private filename: string;
    private options: LocalServerOptions;

    constructor(url: URL, options: Partial<LocalServerOptions>) {
        this.rootDir = path.resolve(url.pathname);
        this.filename = path.join(this.rootDir, dbFilename);
        this.options = {...defaultOptions, ...options};
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
            throw new Error(`Local server: ${this.rootDir} is not a directory`);
        }
        if (this.options.init === true && rootStat === undefined) {
            await fs.ensureDir(this.rootDir);
        }

        const exists = await fs.pathExists(this.filename);
        if (exists === false && this.options.init === false) {
            throw new Error(`Adapt local server file '${this.filename}' does not exist`);
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
                throw new Error(`File '${this.filename}' is not a valid Adapt local server file`);
            }
        } else {
            this.db.push("/adaptLocalServerVersion", currentVersion);
        }
        openDbs.set(this.filename, this.db);
    }

    async set(dataPath: string, val: any, options?: SetOptions): Promise<void> {
        if (options != null && options.mustCreate === true) {
            try {
                this.db.getData(dataPath);
                throw new Error(`Local server: path '${dataPath}' already exists`);
            } catch (err) {
                if (err.name !== "DataError") throw err;
            }
        }
        this.db.push(dataPath, val);
    }

    async get(dataPath: string): Promise<any> {
        return this.db.getData(dataPath);
    }

    async delete(dataPath: string): Promise<void> {
        this.db.delete(dataPath);
    }

    async historyStore(dataPath: string, init: boolean): Promise<HistoryStore> {
        return createLocalHistoryStore(
            this.db, dataPath, path.join(this.rootDir, dataPath), init);
    }
}
