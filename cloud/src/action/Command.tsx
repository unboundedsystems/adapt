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

import { ChangeType } from "@adpt/core";
import { ensureError, MessageLogger } from "@adpt/utils";
import execa from "execa";
import { inspect } from "util";
import { Action, ActionContext, ShouldActDetail } from "./Action";

export interface CommandProps {
    shouldRun?: string[];
    shouldDelete?: string[];
    run: string[];
    delete?: string[];
}

async function runCommand(cmd: string[], cmdName: string, log: MessageLogger, allowCode1 = false) {
    if (cmd.length === 0) throw new Error(`Command ${cmdName} array must have at least 1 entry`);
    const exec = cmd[0];
    if (!exec) throw new Error(`Command ${cmdName} invalid: ${inspect(cmd)}`);

    try {
        const ret = await execa(exec, cmd.slice(1));
        if (ret.stdout) log.info(ret.stdout);
        if (ret.stderr) log.error(ret.stderr);
        return 0;

    } catch (err) {
        err = ensureError(err);

        // execa throws a plain Error, but with additional stuff attached
        if (err.failed === true && err.exitCode !== undefined) {
            if (err.stdout) log.info(err.stdout);
            if (err.stderr) log.error(err.stderr);

            if (allowCode1 && err.exitCode === 1) return 1;

            const output = err.stderr || err.stdout;
            let msg = `Command ${cmdName} (${cmd.join(" ")}) failed. [returned ${err.exitCode}]`;
            if (output) msg += `:\n${output}`;
            throw new Error(msg);
        }
        throw err;
    }
}

export class Command extends Action<CommandProps> {
    async shouldAct(op: ChangeType, ctx: ActionContext): Promise<ShouldActDetail> {
        let detail = "Running command: ";
        if (op === ChangeType.delete) {
            if (!this.props.delete) return { act: false, detail: "No delete command"};
            detail += this.props.delete.join(" ");
            if (!this.props.shouldDelete) return { act: true, detail };
        } else {
            detail += this.props.run.join(" ");
            if (!this.props.shouldRun) return { act: true, detail };
        }

        const cmdName = op === ChangeType.delete ? "shouldDelete" : "shouldRun";
        const cmd = this.props[cmdName];
        if (!cmd) throw new Error(`Earlier cmd check failed`);

        const cmdRet = await runCommand(cmd, cmdName, ctx.logger, true);

        return {
            act: cmdRet === 0,
            detail,
        };
    }

    async action(op: ChangeType, ctx: ActionContext) {
        const cmdName = op === ChangeType.delete ? "delete" : "run";
        const cmd = this.props[cmdName];
        if (!cmd) {
            const msg = op === ChangeType.delete ?
                `Command delete action run without delete action defined` :
                `Command run array is null`;
            throw new Error(msg);
        }

        await runCommand(cmd, cmdName, ctx.logger);
    }
}
export default Command;
