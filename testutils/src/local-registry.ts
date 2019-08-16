/*
 * Copyright 2018 Unbounded Systems, LLC
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

import * as fs from "fs-extra";
import * as http from "http";
import startVerdaccio from "verdaccio";

export interface Registry {
    url: string;
    max_fails?: number;
    timeout?: string;
    fail_timeout?: string;
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

export interface Server {
    httpServer: http.Server;
    stop(this: Server): Promise<void>;
}

class ServerImpl implements Server {
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

export async function start(config: Config, configPath: string): Promise<Server> {
    const { clearStorage, storage, onStart } = config;

    if (clearStorage) await fs.emptyDir(storage);
    else await fs.ensureDir(storage);

    const server = await new Promise<http.Server>((resolve, reject) => {
        try {
            startVerdaccio(config, config.listen, configPath, "1.0.0", "verdaccio",
                (webServer: http.Server, addr: any, _pkgName: any, _pkgVersion: any) => {
                    webServer.on("error", reject);
                    webServer.listen(addr.port || addr.path, addr.host, () => {
                        resolve(webServer);
                    });
                });
        } catch (err) {
            reject(err);
        }
    });

    try {
        if (onStart) await onStart();
        return new ServerImpl(server);
    } catch (err) {
        server.close();
        throw err;
    }
}
