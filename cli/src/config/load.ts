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

import {
    AnyObject,
    ensureError,
    isObject,
    JsonValue,
    parseJson5,
    readJson5,
    stringifyJson5,
    UserError,
} from "@adpt/utils";
import { IConfig } from "@oclif/config";
import Conf from "conf";
import db from "debug";
import fs from "fs-extra";
import pDefer from "p-defer";
import path from "path";
import {
    CliConfig,
    CliState,
    cliStateDefaults,
    UserConfigParsed,
    userConfigProps,
    UserConfigProps,
    userConfigSchema,
} from "./config";
import { getValIfSet } from "./get_val";

// tslint:disable-next-line: no-var-requires
const pjson = require("../../../package.json");

const debug = db("adapt:config");

const envPrefix = "ADAPT_CONFIG_";
const defaultConfigFilenames = [
    "config.json5",
    "config.json",
];

let pConfig: pDefer.DeferredPromise<CliConfig> | undefined;

export async function findUserConfigFile(pkgConfig: IConfig): Promise<string> {
    for (const fn of defaultConfigFilenames) {
        const filename = path.join(pkgConfig.configDir, fn);
        if (await fs.pathExists(filename)) return filename;
    }
    return path.join(pkgConfig.configDir, defaultConfigFilenames[0]);
}

async function readUserConfigFile(userConfigFile: string): Promise<AnyObject> {
    try {
        const val: JsonValue = await readJson5(userConfigFile);
        if (val == null || !isObject(val) || Array.isArray(val)) {
            throw new Error(`Does not contain a single object in ` +
                `JSON/JSON5 format (actual type=${typeof val})`);
        }
        return val;

    } catch (err) {
        if (err && err.code === "ENOENT") return {}; // Empty config
        return throwConfigFileError(userConfigFile, err);
    }
}

export function throwConfigFileError(userConfigFile: string, err: any, info = ""): never  {
    err = ensureError(err);
    if (info) info = ` ${info}`;
    let msg = `Config file '${userConfigFile}'${info}: `;
    switch (err.code) {
        case "ENOENT": msg += "File not found"; break;
        case "EACCES": msg += "Permission denied"; break;
        default:
            if (err.message) {
                msg += err.message.replace(/^Error: /, "");
            } else {
                msg += "Unknown error - " + err.toString();
            }
    }
    throw new UserError(msg);
}

const envVarPropTransform = (prop: string) => envPrefix + prop.toUpperCase();

export interface UserConfigDetail {
    /** Value after parsing and validation for use internally */
    parsed: any;
    sourceType: "Environment" | "File" | "Default";
    source: string;
    /** Value in its preferred storage form */
    store: any;
    valid: boolean;
}

export type UserConfigDetailsKnown = {
    [ Prop in UserConfigProps]: UserConfigDetail;
};

export interface UserConfigDetails extends UserConfigDetailsKnown {
    [ prop: string ]: UserConfigDetail | undefined;
}

export async function loadUserConfig(userConfigFile: string) {
    const rawConf = await readUserConfigFile(userConfigFile);
    const conf: UserConfigParsed = {} as any;
    const details: UserConfigDetails = {} as any;
    const sources = [
        {
            sourceType: "Environment" as const,
            source: envVarPropTransform,
            obj: process.env,
            opts: { propTransform: envVarPropTransform },
        },
        {
            sourceType: "File" as const,
            source: userConfigFile,
            obj: rawConf,
        },
        {
            sourceType: "Default" as const,
            source: "Default",
            obj: {},
            opts: { useDefault: true },
        },
    ];

    function getVal(key: UserConfigProps) {
        for (const s of sources) {
            const val = getValIfSet(key, s.obj, userConfigSchema, s.opts);
            if (val != null) {
                (conf as any)[key] = val.parsed;
                details[key] = {
                    parsed: val.parsed,
                    sourceType: s.sourceType,
                    source: typeof s.source === "function" ? s.source(key) : s.source,
                    store: val.store,
                    valid: true,
                };
                return;
            }
        }
    }

    userConfigProps.forEach(getVal);

    // Find any user config keys we don't understand
    const badKeys =
        Object.keys(rawConf)
        .filter((key) => !(key in userConfigSchema));

    badKeys.forEach((key) => {
        details[key] = {
            parsed: rawConf[key],
            sourceType: "File" as const,
            source: userConfigFile,
            store: rawConf[key],
            valid: false,
        };
    });

    // Print warnings for config keys we don't understand
    // TODO: This should not be a debug, but rather a log message that doesn't
    // display with the default CLI log level.
    if (debug.enabled && badKeys.length) {
        debug(`The following configuration items are invalid: ${badKeys.join(", ")}`);
    }

    return {
        config: conf,
        details,
    };
}

export function createState(configDir: string, versionCheck = true): Conf<CliState> {
    const state = new Conf<CliState> ({
        configName: ".state",
        cwd: configDir,
        defaults: cliStateDefaults,

        deserialize: parseJson5,
        serialize: (val) => stringifyJson5(val, { space: 2 }) + "\n",
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
    const userConfigFile = await findUserConfigFile(pkgConfig);
    const user = (await loadUserConfig(userConfigFile)).config;
    const state = createState(pkgConfig.configDir);

    if (!pConfig) pConfig = pDefer();
    pConfig.resolve({
        state,
        package: pkgConfig,
        user,
        userConfigFile,
    });
}

export function config(): Promise<CliConfig> {
    if (!pConfig) pConfig = pDefer();
    return pConfig.promise;
}

/**
 * Exported for testing only
 * @internal
 */
export function _resetConfig() {
    pConfig = undefined;
}
