/*
 * Copyright 2020 Unbounded Systems, LLC
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

import db from "debug";
import execa from "execa";
import { isExecaError } from "../common";
import { EnvSimple } from "../env";
import { Manifest } from "../k8s/manifest_support";

const debug = db("adapt:cloud:gcloud");

export interface GCloudGlobalOpts {
    configuration?: string;
}

export interface Config {
    name: string;
    env: EnvSimple;
    args: string[];
    image: string;
    region: string;
    port: number;
    trafficPct: number;
    cpu: string | number;
    memory: string | number;
    allowUnauthenticated: boolean;
    globalOpts: GCloudGlobalOpts;
}

export async function cloudRunDescribe(config: Config): Promise<Manifest | undefined> {
    try {
        const result = await execGCloud([
            "run",
            "services",
            "describe",
            "--platform=managed",
            "--format=json",
            `--region=${config.region}`,
            config.name
        ], config.globalOpts);

        return JSON.parse(result.stdout);
    } catch (e) {
        if (isExecaError(e) && e.exitCode !== 0 && e.stderr.match(/Cannot find service/)) {
            return undefined;
        }
        throw e;
    }
}

export async function cloudRunDeploy(config: Config): Promise<void> {
    const env = config.env;
    const args = config.args;
    // Need better escaping here.  See Issue #221
    const envString = Object.entries(env).map(([k, v]) => `${k}=${v}`).join(",");
    const argsString = args.join(",");
    const authArg = config.allowUnauthenticated
        ? "--allow-unauthenticated"
        : "--no-allow-unauthenticated";

    const gcargs = [
        "run",
        "deploy",
        config.name,
        "--platform=managed",
        "--format=json",
        authArg,
        `--memory=${config.memory}`,
        `--cpu=${config.cpu}`,
        `--image=${config.image}`,
        `--region=${config.region}`,
        `--port=${config.port}`,
        `--set-env-vars=${envString}`,
        `--args=${argsString}`
    ];

    await execGCloud(gcargs, config.globalOpts);
}

export async function cloudRunUpdateTraffic(config: Config): Promise<void> {
    const gcargs = [
        "run",
        "services",
        "update-traffic",
        config.name,
        "--platform=managed",
        "--format=json",
        `--region=${config.region}`,
        `--to-revisions`,
        `LATEST=${config.trafficPct}`
    ];

    await execGCloud(gcargs, config.globalOpts);
}

export async function cloudRunDelete(config: Config): Promise<void> {
    try {
        await execGCloud([
            "run",
            "services",
            "delete",
            config.name,
            "--platform=managed",
            "--format=json",
            `--region=${config.region}`
        ], config.globalOpts);
    } catch (e) {
        if (isExecaError(e) && e.exitCode !== 0 && e.stderr.match(/Cannot find service/)) {
            return undefined;
        }
        throw e;
    }
}

export async function execGCloud(
    args: string[],
    globalOpts: GCloudGlobalOpts,
    options: execa.Options = {}) {

    const execaOpts = {
        all: true,
        ...options,
    };

    const fullArgs = [ "--quiet", ...args ];
    if (globalOpts.configuration) {
        fullArgs.unshift(`--configuration=${globalOpts.configuration}`);
    }

    debug(`Running: gcloud ${fullArgs.join(" ")}`);
    try {
        const ret = execa("gcloud", fullArgs, execaOpts);
        return await ret;
    } catch (e) {
        if (isExecaError(e) && e.all) e.message = `${e.shortMessage}\n${e.all}`;
        debug(`Failed: gcloud ${fullArgs.join(" ")}: ${e.message}`);
        throw e;
    }
}
