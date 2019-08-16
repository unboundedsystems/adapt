/*
 * Copyright 2018-2019 Unbounded Systems, LLC
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

import { InternalError, mkdtmp, MkdtmpPromise } from "@adpt/utils";
import { command, expect, test as oclifTest } from "@oclif/test";
// tslint:disable-next-line:no-submodule-imports
import { loadConfig } from "@oclif/test/lib/load-config";
// tslint:disable-next-line:no-submodule-imports
import fancyEnv from "fancy-test/lib/env";
// tslint:disable-next-line:no-submodule-imports
import { Base, Context, EnvOptions, Plugins } from "fancy-test/lib/types";
import fs from "fs-extra";
import path from "path";

export interface Env {
    [key: string]: string | null | undefined;
}
export type DelayedEnvFunc<C extends Context> = (ctx: C) => Env;

function delayedenv<C extends Context, P extends Plugins>
    (this: Base<C, P>, getEnv?: DelayedEnvFunc<C>, opts?: EnvOptions) {
    let envCtx: any;
    return {
        run(ctx: C) {
            if (getEnv == null) {
                throw new Error(`Must supply a function as the first argument to delayedenv`);
            }
            envCtx = fancyEnv(getEnv(ctx), opts);
            envCtx.run();
        },
        finally(_ctx: C) {
            envCtx.finally();
        }
    };
}

type DelayedCmdFunc = () => string[] | string;

function delayedcommand(getCmd?: DelayedCmdFunc, opts: loadConfig.Options = {}) {
    return {
        run(ctx: any) {
            if (getCmd == null) throw new Error(`delayedcommand must have at least one arg`);
            return command(getCmd(), opts).run(ctx);
        }
    };
}

function onerror(fn?: (ctx: any) => void) {
    if (fn == null) throw new Error(`onerror requires one argument`);
    return {
        finally(ctx: { error: object }) {
            if (ctx.error != null) fn(ctx);
        }
    };
}

function skipWithMessage(msg: string): Mocha.PendingTestFunction {
    return (titleOrFunc: string | Mocha.Func | Mocha.AsyncFunc, func?: Mocha.Func | Mocha.AsyncFunc) => {
        const skipped = ` [skipped: ${msg}]`;
        return typeof titleOrFunc === "string" ?
            it.skip(titleOrFunc + skipped, func) :
            it.skip(skipped, titleOrFunc);
    };
}

export interface SshKeyOpts {
    /**
     * Name of an environment variable that contains the contents of the
     * key as a string.
     */
    fromEnv?: string;
    /**
     * Filename to use when writing the key contents to the temporary
     * SSH directory.
     */
    keyFile?: string;
}

const withSshKeyDefaults = {
    fromEnv: "ADAPT_UNIT_TEST_KEY",
    keyFile: "id_rsa",
};

export interface WithSshKeyCtx extends Context {
    withSshKeyDir?: string;
    withSshKeyFile?: string;
}

function withSshKey(options: SshKeyOpts = {}) {
    const opts = { ...withSshKeyDefaults, ...options };
    let remove: MkdtmpPromise["remove"] | undefined;
    let key: string | undefined;

    return {
        async init(ctx: WithSshKeyCtx) {
            key = process.env[opts.fromEnv];
            if (!key) {
                ctx.test = skipWithMessage(`No SSH key found in environment variable '${opts.fromEnv}'`);
            }
        },

        async run(ctx: WithSshKeyCtx) {
            if (!key) throw new InternalError(`key should not be empty`);
            const dirP = mkdtmp("adapt-cli-sshdir");
            remove = dirP.remove;
            const dir = await dirP;
            const keyFile = path.join(dir, opts.keyFile);
            await fs.writeFile(keyFile, key, { mode: 0o600 });

            if (ctx.withSshKeyDir) {
                await remove();
                throw new Error(`withSshKeyDir already set??`);
            }
            ctx.withSshKeyDir = dir;
            ctx.withSshKeyFile = keyFile;
        },

        async finally(ctx: WithSshKeyCtx) {
            delete ctx.withSshKeyDir;
            delete ctx.withSshKeyFile;
            if (remove) await remove();
        }
    };
}

export const clitest =
    oclifTest
    .register("delayedenv", delayedenv)
    .register("delayedcommand", delayedcommand)
    .register("onerror", onerror)
    .register("withSshKey", withSshKey);

export {
    EnvOptions,
    expect,
};
