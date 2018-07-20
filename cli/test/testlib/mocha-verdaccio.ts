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
    auth: { [name: string]: any; };
    storage: string;
    uplinks: { [name: string]: Registry; };
    packages: { [pattern: string]: Package; };
    logs?: Log[];
    self_path?: string;
    clearStorage?: boolean;
    onStart?: (done: MochaDone) => void;
}

type FixtureFunc = (callback: (done: MochaDone) => PromiseLike<any> | void) => void;

function fixture(beforeFn: FixtureFunc, afterFn: FixtureFunc,
                 config: Config, listen: string, configPath: string) {
    let server: http.Server | null = null;

    beforeFn(function startVerdaccio(done: (err?: Error) => void) {
        const p = config.clearStorage ?
            fs.emptyDir(config.storage) : fs.ensureDir(config.storage);

        p.then(() => verdaccio(config, listen, configPath, "1.0.0", "verdaccio",
            (webServer: any, addr: any, _pkgName: any, _pkgVersion: any) => {
                server = webServer;
                webServer.listen(addr.port || addr.path, addr.host, () => {
                    if (config.onStart) config.onStart(done);
                    else done();
                });
            }));
    });

    afterFn(function stopVerdaccio(done: (err?: Error) => void) {
        if (server) server.close(done);
    });
}

export function all(config: Config, listen: string, configPath: string) {
    fixture(before, after, config, listen, configPath);
}

export function each(config: Config, listen: string, configPath: string) {
    fixture(beforeEach, afterEach, config, listen, configPath);
}
