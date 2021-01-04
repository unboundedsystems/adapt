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

import { installType, InstallType, isObject, userAgent, UserError } from "@adpt/utils";
import boxen from "boxen";
import chalk from "chalk";
import { spawn } from "child_process";
import Conf from "conf";
import db from "debug";
import fs from "fs-extra";
import fetch from "node-fetch";
import os from "os";
import path from "path";
import semver from "semver";
import { CliState } from "../config";
import { VersionSummary, VersionSummaryEntry } from "./versions";

// tslint:disable-next-line: no-var-requires
const pjson = require("../../../package.json");

const debug = db("adapt:upgrade");

export interface UpgradeCheckerConfig {
    channel: string;
    configDir: string;
    logDir: string;
    /** Timeout in milliseconds */
    timeout?: number;
    /** Interval in milliseconds */
    upgradeCheckInterval: number;
    upgradeCheckUrl: string;
    /** Interval in milliseconds */
    upgradeRemindInterval: number;
    /** Don't remind about this version */
    upgradeIgnore: string;
}

const checkerDefaults = {
    timeout: 30 * 1000,
};

export interface NotifyOptions {
    fancy?: boolean;
}

export class UpgradeChecker {
    readonly config: Required<UpgradeCheckerConfig>;

    constructor(config: UpgradeCheckerConfig, private state: Conf<CliState>) {
        this.config = { ...checkerDefaults, ...config };
    }

    async check() {
        const interval = this.config.upgradeCheckInterval;
        if ((Date.now() - this.state.get("lastUpgradeCheck")) < interval) {
            debug(`Not time to check (interval=${interval})`);
            return;
        }

        await fs.ensureDir(this.config.logDir);
        const logFile = path.join(this.config.logDir, "upgrade-check.log");
        const logFd = await fs.open(logFile, "a");

        const childPath = path.join(__dirname, "check.js");
        const args = [ childPath, JSON.stringify(this.config) ];

        debug(`Spawning child to check for upgrade: ${args}`);
        const child = spawn(process.execPath, args, {
            detached: !isWindows(),
            stdio: [ "ignore", logFd, logFd ],
        });
        child.unref();
        await fs.close(logFd);
    }

    async notifyString(options: NotifyOptions = {}) {
        const upgradeInfo = this.upgrade;
        let current = this.state.get("version");
        let latest = upgradeInfo && upgradeInfo.latest;
        const summary = upgradeInfo && upgradeInfo.summary;
        const latestIsNewer = latest && semver.gt(latest, current);
        const now = remindNow(this.state.get("lastUpgradeReminder"), this.config.upgradeRemindInterval);
        const ignoreVer = this.config.upgradeIgnore;

        if (!process.stdout.isTTY || !latest || !latestIsNewer || !now || latest === ignoreVer) {
            debug(`Not notifying: tty=${process.stdout.isTTY} ` +
                `current=${current} latest=${latest} now=${now} ignoreVer=${ignoreVer}`);
            return undefined;
        }

        const pkg = pjson.name;

        let cmd;
        switch (await installType(__dirname)) {
            case InstallType.npmGlobal: cmd = "npm install -g"; break;
            case InstallType.yarnGlobal: cmd = "yarn global add"; break;
            case InstallType.yarn: cmd = "yarn add"; break;
            case InstallType.npm:
            default:
                cmd = "npm install";
                break;
        }

        cmd += ` ${pkg}@${latest}`;
        let ignore = "Ignore:";
        let ignoreCmd = `adapt config:set upgradeIgnore ${latest}`;

        if (options.fancy) {
            current = chalk.dim(current);
            latest = chalk.greenBright(latest);
            cmd = chalk.bold.cyanBright(cmd);
            ignore = chalk.dim(ignore);
            ignoreCmd = chalk.cyan(ignoreCmd);
        }

        let output = `Upgrade available: ${current} → ${latest}\n`;

        if (summary && (summary.description || summary.securityFixes)) {
            output += "\n";

            if (summary.description) {
                output += `${latest}: ${summary.description}\n`;
            }

            if (summary.securityFixes) {
                output += `This upgrade contains security fixes\n`;
            }
        }

        output +=
            `\nUpgrade: ${cmd}\n` +
            `${ignore}  ${ignoreCmd}`;

        if (options.fancy) {
            output = boxen(output, {
                borderStyle: boxen.BorderStyle.Bold,
                float: "center",
                margin: 1,
                padding: 1,
            });
        }
        this.state.set("lastUpgradeReminder", Date.now());
        return output;
    }

    /**
     * This method should not be called directly. It is called when the
     * check method invokes a subprocess that executes check.ts, which calls
     * this method.
     */
    async fetch(): Promise<CliState["upgrade"]> {
        const version = this.state.get("version");
        // Understand how long users run a particular version before
        // updating so we can evaluate deprecation/support timelines.
        const q = `?x-installed=${this.state.get("installed")}`;
        const ua = await userAgent({
            name: pjson.name,
            version,
            docker: true,
        });

        let resp;
        try {
            resp = await fetch(this.config.upgradeCheckUrl + q, {
                headers: { "User-Agent": ua },
                timeout: this.config.timeout,
            });
        } catch (err) {
            if (err.name === "FetchError") {
                throw new UserError(`Error fetching version information: ${err.message}`);
            }
            throw err;
        }
        const body = await resp.text();

        if (resp.status !== 200) {
            const trimmed = body.trim();
            let msg = `Status ${resp.status} (${resp.statusText})`;
            if (trimmed) msg += " " + trimmed;
            throw new UserError(msg);
        }
        debug("Upgrade check response:", body);

        let ret;
        try {
            ret = JSON.parse(body);
        } catch (err) {
            if (err.name === "SyntaxError") {
                throw new UserError(`Invalid JSON response: ${err.message}`);
            }
            throw err;
        }
        if (!validateSummary(ret)) throw new Error(`Invalid upgrade check response`);

        const latest = ret.channelCurrent[this.config.channel];
        if (!latest) {
            throw new UserError(`No information available for channel '${this.config.channel}'`);
        }

        const verSummary = ret.versions[latest];

        const summary: VersionSummaryEntry = {
            channel: this.config.channel,
            description: verSummary && verSummary.description,
            securityFixes: hasSecurityFixes(version, latest, this.config.channel, ret),
        };

        return {
            latest,
            summary,
        };
    }

    get upgrade(): CliState["upgrade"] | undefined {
        return this.state.get("upgrade");
    }
}

class SummaryError extends UserError {
    constructor(msg: string) {
        super(`Invalid response: ${msg}`);
    }
}

function validateSummary(obj: any): obj is VersionSummary {
    if (!isObject(obj)) throw new SummaryError(`Response was not a valid object`);
    if (typeof obj.name !== "string") throw new SummaryError(`Invalid name property`);
    if (!obj.name.includes("cli")) throw new SummaryError(`Unrecognized package name`);
    if (!isObject(obj.channelCurrent)) throw new SummaryError(`Invalid channelCurrent property`);
    if (!isObject(obj.versions)) throw new SummaryError(`Invalid versions property`);
    return true;
}

const isWindows = () => os.platform() === "win32";

/**
 * Exported for testing
 */
export function hasSecurityFixes(current: string, latest: string,
    channel: string, summary: VersionSummary): boolean {

    const range = `>${current} <=${latest}`;

    const versions =
        Object.entries(summary.versions)
        .filter(([ver, sum]) =>
            sum.channel === channel &&
            sum.securityFixes &&
            semver.satisfies(ver, range));
    return versions.length !== 0;
}

function remindNow(lastReminder: number | undefined, interval: number) {
    if (interval <= 0) return false;
    return (Date.now() - (lastReminder || 0)) >= interval;
}
