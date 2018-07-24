import * as fs from "fs-extra";
import * as http from "http";

import verdaccio from "verdaccio";

export interface Registry {
    url: string;
}

export interface Package {
    access?: string;
    publish?: string;
    proxy?: string;
}

export interface Log {
    type?: "stdout" | "file";
    format?: "pretty" | "pretty-timestamped";
    level?: "fatal" | "error" | "warn" | "http" | "info" | "debug" | "trace";
    file?: string;
}

export interface Config {
    // Items from the verdacchio package
    auth: { [name: string]: any; };
    storage: string;
    uplinks: { [name: string]: Registry; };
    packages: { [pattern: string]: Package; };
    logs?: Log[];
    self_path?: string;

    // Our additional config items
    listen: string;
    clearStorage?: boolean;
    onStart?: () => Promise<void>;
}

export interface VerdaccioServer {
    httpServer: http.Server;
    stop(this: VerdaccioServer): Promise<void>;
}

class VerdaccioServerImpl implements VerdaccioServer {
    constructor(public httpServer: http.Server) {}

    stop(): Promise<void> {
        return new Promise((resolve, reject) => {
            try {
                this.httpServer.close(resolve);
            } catch (err) {
                reject(err);
            }
        });
    }
}

export async function start(config: Config, configPath: string): Promise<VerdaccioServer> {
    let server: http.Server | undefined;
    const { clearStorage, storage, onStart } = config;

    if (clearStorage) await fs.emptyDir(storage);
    else await fs.ensureDir(storage);

    let p: Promise<void> = new Promise((resolve, reject) => {
        try {
            verdaccio(config, config.listen, configPath, "1.0.0", "verdaccio",
                (webServer: any, addr: any, _pkgName: any, _pkgVersion: any) => {
                    server = webServer;
                    webServer.listen(addr.port || addr.path, addr.host, () => {
                        resolve();
                    });
                });
        } catch (err) {
            reject(err);
        }
    });

    if (onStart) {
        p = p.then(() => onStart());
    }

    return p.then(() => {
        if (server == null) {
            throw new Error(`Unable to start verdaccio. server == null`);
        }
        return new VerdaccioServerImpl(server);
    });
}
