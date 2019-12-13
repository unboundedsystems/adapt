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

import decamelize from "decamelize";
import execa from "execa";

export type LogLevel = "silent" | "error" | "warn" | "notice" | "http" |
    "timing" | "info" | "verbose" | "silly";

export interface CommonOptions {
    cwd?: string;
    loglevel?: LogLevel;
    pipeOutput?: boolean;
    progress?: boolean;
    registry?: string;
    userconfig?: string;
}

interface AnyOptions {
    [key: string]: any;
}

export const commonDefaults = {
    loglevel: "error",
    pipeOutput: false,
    progress: false,
};

export interface NpmOutput {
    stdout: string;
    stderr: string;
}

export function run(action: string, options: CommonOptions | AnyOptions, args?: string[]): Promise<NpmOutput> {
    // tslint:disable-next-line:prefer-const
    let { cwd = null, pipeOutput, ...finalOpts } = { ...commonDefaults, ...options };
    cwd = cwd || process.cwd();

    let finalArgs = [action];
    for (const opt of Object.keys(finalOpts)) {
        const flag = "--" + decamelize(opt, "-");
        const val = (finalOpts as any)[opt];
        finalArgs = finalArgs.concat([flag, val.toString()]);
    }
    if (args) finalArgs = finalArgs.concat(args);

    try {
        const prom = execa("npm", finalArgs, { all: true, cwd, stripFinalNewline: false });
        if (pipeOutput) {
            prom.stdout.pipe(process.stdout);
            prom.stderr.pipe(process.stdout);
        }
        return prom;
    } catch (err) {
        err.message = `npm ${action} failed: ${err.message}`;
        if (err.all) err.message += "\n" + err.all;
        throw err;
    }
}
