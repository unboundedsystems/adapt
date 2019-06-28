import { URL } from "url";
import { HistoryStore } from "./history";

export const $serverLock = Symbol.for("$serverLock");

export interface ServerLock {
    // Implementation details are private to each server implementation
    [$serverLock]: true;
}

export interface AdaptServer {
    init(): Promise<void>;
    destroy(): Promise<void>;

    set(dataPath: string, val: any, options?: SetOptions): Promise<void>;
    get(dataPath: string, options?: GetOptions): Promise<any>;
    delete(dataPath: string, options?: DeleteOptions): Promise<void>;
    lock(): Promise<ServerLock>;
    unlock(lock: ServerLock): Promise<void>;
    historyStore(dataPath: string, init: boolean): Promise<HistoryStore>;
}

export interface OptionsWithLock {
    lock?: ServerLock;
}

export interface SetOptions extends OptionsWithLock {
    mustCreate?: boolean;
}

export interface GetOptions extends OptionsWithLock {
}

export interface DeleteOptions extends OptionsWithLock {
}

export interface ServerOptions {
}

export interface AdaptServerType {
    urlMatch: RegExp;
    new (url: URL, options: ServerOptions): AdaptServer;
}

// Exported for testing only
let serverTypes: AdaptServerType[] = [];

export function mockServerTypes_(sTypes?: AdaptServerType[]) {
    const oldTypes = serverTypes;
    if (sTypes != null) serverTypes = sTypes;
    return oldTypes;
}

export function register(serverType: AdaptServerType) {
    serverTypes.push(serverType);
}

export async function adaptServer(url: string, options: ServerOptions): Promise<AdaptServer> {
    let parsed: URL;
    try {
        parsed = new URL(url);
    } catch (err) {
        if (err instanceof TypeError) {
            throw new Error(`Invalid Adapt server url '${url}'`);
        }
        throw err;
    }

    for (const sType of serverTypes) {
        if (sType.urlMatch.test(url)) {
            const server = new sType(parsed, options);
            await server.init();
            return server;
        }
    }
    throw new Error(`Adapt server url '${url}' is not a supported url type.`);
}

export async function withLock<T>(server: AdaptServer, f: (l: ServerLock) => Promise<T>): Promise<T> {
    const lock = await server.lock();
    try {
        return await f(lock);
    } finally {
        await server.unlock(lock);
    }
}
