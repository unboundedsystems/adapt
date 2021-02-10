/*
 * Copyright 2019-2021 Unbounded Systems, LLC
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
import execa, { ExecaReturnValue, Options as ExecaOptions } from "execa";
import { Readable } from "stream";

export function streamToDebug(s: Readable, d: db.IDebugger, prefix?: string) {
    prefix = prefix ? `[${prefix}] ` : "";
    s.on("data", (chunk) => d(prefix + chunk.toString()));
    s.on("error", (err) => d(prefix, err));
}

export interface DebugExecOptions extends ExecaOptions {
    printFailure?: boolean;
}

const execDefaults = {
    printFailure: true,
};

export function debugExec(cmdDebug: db.Debugger, outputDebug: db.Debugger) {
    let _cmdId = 0;
    const cmdId = () => ++_cmdId;

    const exec = async (cmd: string, args: string[], options: DebugExecOptions = {}): Promise<ExecaReturnValue> => {
        const { printFailure, ...opts } = { ...execDefaults, ...options };

        opts.all = true;

        const debug =
            outputDebug.enabled ? outputDebug.extend((cmdId()).toString()) :
                cmdDebug.enabled ? cmdDebug :
                    null;
        if (debug) debug(`Running: ${cmd} ${args.join(" ")}`);
        try {
            const ret = execa(cmd, args, opts);
            if (outputDebug.enabled && debug) {
                streamToDebug(ret.stdout, debug);
                streamToDebug(ret.stderr, debug);
            }
            return await ret;
        } catch (e) {
            if (e.all) e.message = `${e.shortMessage}\n${e.all}`;
            if (debug && printFailure) debug(`FAILED: ${cmd} ${args.join(" ")}: ${e.shortMessage || e.message}`);
            throw e;
        }
    };
    return exec;
}
