/*
 * Copyright 2019-2020 Unbounded Systems, LLC
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

import { Console } from "console";
import execa from "execa";
import { createWriteStream, existsSync, WriteStream } from "fs-extra";
import path from "path";
import { format } from "util";
import { InternalError } from "./internal_error";
import { repoRootDir } from "./paths";

export const buildDir = path.join(repoRootDir, "build");
export const buildLogDir = getBuildLogDir();
export const buildLogEnabled = !!buildLogDir;

let warned = false;

export function ciReportEnabled(level = 1) {
    const enabledEnv = process.env.ADAPT_CI_REPORT;
    if (enabledEnv == null) return false;
    const enabled = Number(enabledEnv);
    if (isNaN(enabled) || enabled < 0 || enabled > 7 || Math.trunc(enabled) !== enabled) {
        if (!warned) {
            // tslint:disable-next-line: no-console
            console.error(`WARNING: Environment variable ADAPT_CI_REPORT ` +
                `set to invalid value ${enabledEnv}`);
            warned = true;
        }
    }
    return enabled >= level;
}

function pad(num: number, len = 2) {
    return num.toString().padStart(len, "0");
}

export function ciCreateLogfileName(prefix: string) {
    if (!buildLogDir) return undefined;
    const d = new Date();
    const dateStrings = [ d.getMonth() + 1, d.getDate(), d.getHours(),
        d.getMinutes(), d.getSeconds() ].map((n) => pad(n));
    const filename = format("%s-%d%s%s-%s%s%s.%s.log", prefix,
        d.getFullYear(), ...dateStrings, pad(d.getMilliseconds(), 3));
    return path.join(buildLogDir, filename);
}

export function ciCreateLogfileStream(prefix: string) {
    let i = 0;
    while (true) {
        try {
            const logfile = ciCreateLogfileName(prefix);
            if (!logfile) return undefined;
            return createWriteStream(logfile, { flags: "wx" });
        } catch (err) {
            // Retry if the file exists. Should (eventually) get a new timestamp.
            if (err.code !== "EEXIST") throw err;
            if (++i >= 1000) {
                // tslint:disable-next-line: no-console
                console.warn(`WARNING: Unable to create logfile stream for CI (prefix=${prefix})`, err);
                return undefined;
            }
        }
    }
}

const noop = () => {/* */};

export interface CiLoggerOptions {
    lazyCreate?: boolean;
}

const defaultCiLoggerOptions = {
    lazyCreate: true,
};

class CiLogger {
    private console?: Console;
    private logStream?: WriteStream;
    private prefix: string;

    constructor(prefix: string, options: CiLoggerOptions = {}) {
        const opts = { ...defaultCiLoggerOptions, ...options };
        this.prefix = prefix;

        if (!buildLogEnabled) {
            this.log = noop;
            this.logps = noop;
            return;
        }
        if (!opts.lazyCreate) this.create();
    }

    close() {
        if (!this.logStream) return;
        this.logStream.close();
        this.logStream = undefined;
    }

    // Lazy create version. Gets replaced on first call.
    log = (...args: any[]) => {
        if (!this.console) this.console = this.create();
        this.console.log(timestamp(), ...args);
    }

    logps = () => {
        const ret = execa.commandSync("ps auxf");
        this.log("PS", ret.stdout);
    }

    private create() {
        this.logStream = ciCreateLogfileStream(this.prefix);
        if (!this.logStream) throw new InternalError(`Did not create logStream for ${this.prefix}`);
        return new Console(this.logStream);
    }
}

export function ciMaybeCreateLogger(prefix: string, options: CiLoggerOptions = {}) {
    if (!buildLogEnabled) return undefined;
    return ciCreateLogger(prefix, options);
}

export function ciCreateLogger(prefix: string, options: CiLoggerOptions = {}) {
    return new CiLogger(prefix, options);
}

function timestamp() {
    const d = new Date();
    const dateStrings = [ d.getMonth() + 1, d.getDate(), d.getHours(),
        d.getMinutes(), d.getSeconds() ].map((n) => pad(n));
    return format("%d-%s-%s %s:%s:%s.%s", d.getFullYear(),
        ...dateStrings, pad(d.getMilliseconds(), 3));
}

function getBuildLogDir() {
    let dir = process.env.ADAPT_BUILD_LOGDIR;
    if (!dir) return undefined;
    dir = path.resolve(repoRootDir, dir);
    if (!existsSync(dir)) return undefined;
    return dir;
}
