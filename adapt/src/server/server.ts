import { URL } from "url";

export interface AdaptServer {
    init(): Promise<void>;
    set(dataPath: string, val: any, options?: SetOptions): Promise<void>;
    get(dataPath: string): Promise<any>;
    delete(dataPath: string): Promise<void>;
}

export interface SetOptions {
    mustCreate?: boolean;
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
