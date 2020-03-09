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

import { IConfig } from "@oclif/config";
import Conf from "conf";
import { VersionSummaryEntry } from "../upgrade/versions";
import { parseItem, SchemaInputType, SchemaOutputType } from "./schema";

// tslint:disable-next-line: no-var-requires
const pjson = require("../../../package.json");

/**
 * Schema for user config.
 */
export const userConfigSchema = {
    upgradeCheck: {
        description: "Periodically check for new versions of the Adapt CLI",
        default: true,
        asType: "boolean" as const,
    },

    upgradeChannel: {
        description: "Which channel of upgrades to subscribe to (latest or next)",
        default: "latest",
        asType: "string" as const,
    },

    upgradeCheckInterval: {
        description: "Minimum interval between checks for new versions of the Adapt CLI",
        default: "1 day",
        asType: "duration" as const,
    },

    upgradeCheckUrl: {
        description: "Location of where to fetch Adapt CLI version summary information",
        default: "https://adapt-public.s3-us-west-2.amazonaws.com/upgrade-check.json",
        asType: "string" as const,
    },

    upgradeRemindInterval: {
        description: "Minimum interval between reminders about an update",
        default: "7 days",
        asType: "duration" as const,
    },

    upgradeIgnore: {
        description: "Do not display upgrade reminders for this Adapt version",
        default: "",
        asType: "string" as const,
    },
};

export type UserConfigSchema = typeof userConfigSchema;

/**
 * Array of the valid configuration properties (keys).
 */
export const userConfigProps = Object.keys(userConfigSchema) as (keyof UserConfigSchema)[];

/**
 * Map for finding the correct case-sensitive config property from the
 * lower case version.
 */
const userConfigLookup = new Map<string, keyof UserConfigSchema>(
    userConfigProps.map((prop) => [ prop.toLowerCase(), prop ]));

/**
 * Defines what is accepted as input types for the user config.
 */
export type UserConfig = SchemaInputType<UserConfigSchema>;

/**
 * Defines the final user config types, after parsing and any
 * transformation. This is the primary type used for accessing user
 * config data.
 */
export type UserConfigParsed = SchemaOutputType<UserConfigSchema>;

/**
 * Non-user-facing CLI state. This is distinct from any Adapt deployment
 * state and is automatically and atomically read/saved on **every**
 * read or write operation. Managed by Conf.
 */
export interface CliState {
    installed: number;
    lastUpgradeCheck: number;
    lastUpgradeReminder?: number;
    upgrade?: {
        latest: string;
        summary?: VersionSummaryEntry;
    };
    version: string;
}

const now = Date.now();
export const cliStateDefaults = {
    installed: now,
    lastUpgradeCheck: now,
    version: pjson.version,
};

export interface CliConfig {
    user: UserConfigParsed;
    userConfigFile: string;
    package: IConfig;
    state: Conf<CliState>;
}

export function lookupConfigProperty(name: string) {
    return userConfigLookup.get(name.toLowerCase());
}

export function parseConfigItemString<P extends keyof UserConfigSchema>(
    prop: P, val: string) {
    return parseItem(prop, val, userConfigSchema);
}
