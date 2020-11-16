/*
 * Copyright 2019 Unbounded Systems, LLC
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

import * as Config from "@oclif/config";
import * as stdMock from "stdout-stderr";
import { pkgRootDir } from "./paths";

export interface Env {
    [k: string]: string | undefined;
}

const savedEnvs: (typeof process.env)[] = [];

async function withEnv<Ret>(env: Env, func: () => Ret | Promise<Ret>): Promise<Ret> {
    try {
        savedEnvs.push(process.env);
        process.env = { ...process.env, ...env };
        return await func();

    } finally {
        const oldEnv = savedEnvs.pop();
        if (oldEnv) process.env = oldEnv;
    }
}

async function withStdMock(func: () => void | Promise<void>) {
    try {
        stdMock.stdout.start();
        stdMock.stderr.start();
        await func();

    } finally {
        stdMock.stdout.stop();
        stdMock.stderr.stop();
    }
    return {
        stdout: stdMock.stdout.output,
        stderr: stdMock.stderr.output,
    };
}

export async function runCommand(args: string[] | string, env: Env = {}) {
    const config: Config.IConfig = await Config.load({ root: pkgRootDir });
    if (typeof args === "string") args = [args];
    const [id, ...extra] = args;

    return withEnv(env, async () => {
        return withStdMock(async () => {
            await config.runHook("init", { id, argv: extra });
            await config.runCommand(id, extra);
        });
    });
}
