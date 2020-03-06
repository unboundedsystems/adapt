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

import { UserError } from "@adpt/utils";
import { IConfig } from "@oclif/config";
import Conf from "conf";
import db from "debug";
import fs from "fs-extra";
import json5 from "json5";
import pDefer from "p-defer";
import path from "path";
import { CliConfig, CliState, cliStateDefaults, UserConfigParsed, userConfigSchema, UserConfigSchema } from "./config";
import { getValIfSet } from "./get_val";

// tslint:disable-next-line: no-var-requires
const pjson = require("../../../package.json");

const debug = db("adapt:config");

const userConfigProps = Object.keys(userConfigSchema) as (keyof UserConfigSchema)[];

const envPrefix = "ADAPT_CONFIG_";
const defaultConfigFilenames = [
    "config.json5",
    "config.json",
];

let pConfig: pDefer.DeferredPromise<CliConfig> | undefined;

async function readUserConfigFile(pkgConfig: IConfig): Promise<any> {
    let confContents: string | undefined;
    let confFileName: string | undefined;

    for (const fn of defaultConfigFilenames) {
        const filename = path.join(pkgConfig.configDir, fn);
        confFileName = filename;
        try {
            confContents = (await fs.readFile(filename)).toString();
            break;
        } catch (err) {
            if (err && err.code === "ENOENT") continue;
            let msg = `Error reading config file '${confFileName}': `;
            if (err && err.message) msg += err.message;
            else msg += "Unknown error - " + err.toString();
            throw new UserError(msg);
        }
    }
    if (!confContents) return {};

    try {
        return json5.parse(confContents);
    } catch (err) {
        let msg = `Error parsing config file '${confFileName}': `;
        if (err && err.message) {
            msg += err.message.replace("JSON5: ", "");
        } else {
            msg += "Unknown error - " + err.toString();
        }
        throw new UserError(msg);
    }
}

const envVarPropTransform = (prop: string) => envPrefix + prop.toUpperCase();

async function loadUserConfig(pkgConfig: IConfig): Promise<UserConfigParsed> {
    const rawConf = await readUserConfigFile(pkgConfig);
    const conf: any = {};
    const env = process.env;

    for (const key of userConfigProps) {
        const found = (val: any) => {
            if (val == null) return false;
            conf[key] = val;
            return true;
        };

        if (found(getValIfSet(key, env, userConfigSchema, { propTransform: envVarPropTransform }))) continue;
        if (found(getValIfSet(key, rawConf, userConfigSchema, { useDefault: true }))) continue;
    }

    // Print warnings for config keys we don't understand
    // TODO: This should not be a debug, but rather a log message that doesn't
    // display with the default CLI log level.
    if (debug.enabled) {
        const badKeys =
            Object.keys(rawConf)
            .filter((key) => !(key in userConfigSchema))
            .join(", ");
        if (badKeys) debug(`The following configuration items are invalid: ${badKeys}`);
    }

    return conf;
}

export function createState(configDir: string, versionCheck = true): Conf<CliState> {
    const state = new Conf<CliState> ({
        configName: ".state",
        cwd: configDir,
        defaults: cliStateDefaults,

        deserialize: json5.parse,
        serialize: (val) => json5.stringify(val, { space: 2 }) + "\n",
    });
    if (versionCheck && state.get("version") !== pjson.version) {
        state.set({
            installed: Date.now(),
            version: pjson.version,
        });
    }
    return state;
}

export async function createConfig(pkgConfig: IConfig) {
    const user = await loadUserConfig(pkgConfig);
    const state = createState(pkgConfig.configDir);

    if (!pConfig) pConfig = pDefer();
    pConfig.resolve({
        state,
        package: pkgConfig,
        user,
    });
}

export function config(): Promise<CliConfig> {
    if (!pConfig) pConfig = pDefer();
    return pConfig.promise;
}
