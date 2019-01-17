import * as crypto from "crypto";
import * as fs from "fs-extra";
import * as os from "os";
import * as path from "path";
import * as localRegistry from "./local-registry";
import * as localRegistryDefaults from "./local-registry-defaults";

type FixtureFunc = (callback: (done: MochaDone) => PromiseLike<any> | void) => void;

export interface MochaLocalRegOptions {
    port?: number | "auto";
    publishList?: string[];
    storageDir?: "createTemp" | string;
    logLevel?: "fatal" | "error" | "warn" | "http" | "info" | "debug" | "trace";
}

const defaultOpts: Required<MochaLocalRegOptions> = {
    port: "auto",
    publishList: [],
    storageDir: "createTemp",
    logLevel: "error",
};

export interface RegistryFixture {
    npmProxyOpts: localRegistryDefaults.NpmProxyOpts;
    yarnProxyOpts: localRegistryDefaults.YarnProxyOpts;
}

class RegistryFixtureImpl implements RegistryFixture {
    readonly opts: Required<MochaLocalRegOptions>;

    port_?: number;
    server?: localRegistry.Server;
    storage_?: string;
    tmpDir_?: string;

    constructor(options: MochaLocalRegOptions = {}) {
        this.opts = { ...defaultOpts, ...options };
        const dir = this.opts.storageDir;
        if (dir !== "createTemp") this.storage_ = path.resolve(dir);
        if (this.opts.port !== "auto") this.port_ = this.opts.port;
    }

    setupRegistry = async () => {
        if (this.opts.publishList.length === 0) return;
        const resolved = this.opts.publishList.map((p) => path.resolve(p));
        return localRegistryDefaults.setupLocalRegistry(
            resolved, this.npmProxyOpts);
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

    async makeNpmrc() {
        const svr = `//127.0.0.1:${this.port}/`;
        const contents = `
${svr}:_password="dGVzdA=="
${svr}:username=test
${svr}:email=test@root.com
${svr}:always-auth=false
`;
        await fs.writeFile(this.npmrc, contents);
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

    get npmrc() {
        return path.join(this.tmpDir, "npmrc_proxy");
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
    get npmProxyOpts() {
        return {
            registry: `http://127.0.0.1:${this.port}`,
            userconfig: this.npmrc,
        };
    }
    get yarnProxyOpts() {
        return {
            registry: `http://127.0.0.1:${this.port}`,
            // NOTE(mark): Equivalent of userconfig not yet supported with yarn
        };
    }

    async start() {
        this.tmpDir_ = await fs.mkdtemp(path.join(os.tmpdir(), "local_registry-"));

        if (this.opts.storageDir === "createTemp") {
            this.storage_ = path.join(this.tmpDir, "storage");
        }

        let max = 10;
        while (--max >= 0) {
            try {
                this.newPort();
                await this.makeNpmrc();
                const config = this.config;
                this.server = await localRegistry.start(config, config.self_path!);
                return;
            } catch (err) {
                if (!(err && err.code === "EADDRINUSE")) throw err;
            }
        }
        throw new Error(`Unable to start local registry server: port conflicts`);
    }

    async stop() {
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
