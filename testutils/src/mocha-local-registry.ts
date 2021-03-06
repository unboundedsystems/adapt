/*
 * Copyright 2018-2020 Unbounded Systems, LLC
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

import * as crypto from "crypto";
import * as fs from "fs-extra";
import { Done } from "mocha";
import * as os from "os";
import * as path from "path";
import * as localRegistry from "./local-registry";
import * as localRegistryDefaults from "./local-registry-defaults";

type FixtureFunc = (callback: (done: Done) => PromiseLike<any> | void) => void;

export type MochaLocalRegOptions = MochaLocalRegShared | MochaLocalRegConfig;

export interface MochaLocalRegShared {
    port: "shared";
}

export interface MochaLocalRegConfig {
    port?: number | "auto";
    publishList?: string[];
    storageDir?: "createTemp" | string;
    logLevel?: "fatal" | "error" | "warn" | "http" | "info" | "debug" | "trace";
}

const defaultOpts: Required<MochaLocalRegConfig> = {
    port: "auto",
    publishList: [],
    storageDir: "createTemp",
    logLevel: "error",
};

export interface RegistryFixture {
    yarnProxyOpts: localRegistryDefaults.YarnProxyOpts;
}

class RegistryFixtureImpl implements RegistryFixture {
    readonly opts: Required<MochaLocalRegConfig>;
    start_ = true;

    port_?: number;
    server?: localRegistry.Server;
    storage_?: string;
    tmpDir_?: string;
    url_?: string;

    constructor(options: MochaLocalRegOptions = {}) {
        if (options.port === "shared") {
            this.opts = {
                ...defaultOpts,
                publishList: localRegistryDefaults.defaultPublishList,
            };
            if (process.env.ADAPT_TEST_REGISTRY) {
                this.url_ = process.env.ADAPT_TEST_REGISTRY;
                this.start_ = false;
                return;
            }
        } else {
            this.opts = { ...defaultOpts, ...options };
        }
        const dir = this.opts.storageDir;
        if (dir !== "createTemp") this.storage_ = path.resolve(dir);
        if (this.opts.port !== "auto") this.port_ = this.opts.port;
    }

    setupRegistry = async () => {
        if (this.opts.publishList.length === 0) return;
        const resolved = this.opts.publishList.map((p) => path.resolve(p));
        return localRegistryDefaults.setupLocalRegistry(
            resolved, this.yarnProxyOpts);
    }

    newPort() {
        if (this.opts.port === "auto") {
            let max = 10;
            while (--max >= 0) {
                const port = crypto.randomBytes(2).readUInt16BE(0);
                if (port > 1024) {
                    this.port_ = port;
                    return;
                }
            }
            throw new Error(`Unable to select local registry port`);
        }
    }

    get config(): localRegistry.Config {
        return {
            ...localRegistryDefaults.config,
            onStart: this.setupRegistry,
            storage: this.storage,
            listen: `0.0.0.0:${this.port}`,
            clearStorage: false,
            logs: [
                { type: "stdout", format: "pretty", level: this.opts.logLevel }
            ]
        };
    }

    get port() {
        if (!this.port_) throw new Error(`Registry server not started`);
        return this.port_;
    }
    get storage() {
        if (!this.storage_) throw new Error(`Registry server not started`);
        return this.storage_;
    }
    get tmpDir() {
        if (!this.tmpDir_) throw new Error(`Registry server not started`);
        return this.tmpDir_;
    }
    get url() {
        if (!this.url_) this.url_ = `http://127.0.0.1:${this.port}`;
        return this.url_;
    }
    get yarnProxyOpts() {
        return {
            registry: this.url,
            // NOTE(mark): Equivalent of userconfig not yet supported with yarn
        };
    }

    async start() {
        if (!this.start_) return;
        this.tmpDir_ = await fs.mkdtemp(path.join(os.tmpdir(), "local_registry-"));

        if (this.opts.storageDir === "createTemp") {
            this.storage_ = path.join(this.tmpDir, "storage");
        }

        let max = 10;
        while (--max >= 0) {
            try {
                this.newPort();
                const config = this.config;
                this.server = await localRegistry.start(config, config.self_path!);
                return;
            } catch (err) {
                const code = err && err.code;
                if (code !== "EADDRINUSE" && code !== "EACCES") throw err;
            }
        }
        throw new Error(`Unable to start local registry server: port conflicts`);
    }

    async stop() {
        if (!this.start_) return;
        if (this.opts.port === "auto") this.port_ = undefined;
        if (this.opts.storageDir === "createTemp") this.storage_ = undefined;
        if (this.server) await this.server.stop();
        if (this.tmpDir_) await fs.remove(this.tmpDir_);
        this.tmpDir_ = undefined;
    }
}

function setup(beforeFn: FixtureFunc, afterFn: FixtureFunc,
               fixture: RegistryFixtureImpl) {

    beforeFn(async function startLocalRegistry(this: any) {
        this.timeout(2 * 60 * 1000);
        await fixture.start();
    });

    afterFn(async function stopLocalRegistry(this: any) {
        this.timeout(60 * 1000);
        await fixture.stop();
    });
}

export function all(options: MochaLocalRegOptions = {}): RegistryFixture {
    const fixture = new RegistryFixtureImpl(options);
    setup(before, after, fixture);
    return fixture;
}

export function each(options: MochaLocalRegOptions = {}): RegistryFixture {
    const fixture = new RegistryFixtureImpl(options);
    setup(beforeEach, afterEach, fixture);
    return fixture;
}
