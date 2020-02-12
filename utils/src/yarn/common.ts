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

import decamelize from "decamelize";
import execa, { ExecaChildProcess, ExecaError } from "execa";
import npmRunPath from "npm-run-path";
import { ciMaybeCreateLogger } from "../ci_report";

export type LogLevel = "normal" | "silent" | "verbose";

export interface CommonOptions {
    cwd?: string;
    loglevel?: LogLevel;
    modulesFolder?: string;
    mutex?: string;
    noProgress?: boolean;
    registry?: string;
}

export interface InternalOptions extends CommonOptions {
    pipeOutput?: boolean;
    boolNoArgOptions?: string[];
}

const noArgOptions = [
    "noProgress",
];

interface AnyOptions {
    [key: string]: any;
}

export const commonDefaults = {
    loglevel: "normal",
    pipeOutput: false,
    noProgress: true,
};

const npmPath = npmRunPath({ cwd: __dirname });

type OnRejectedFunc<T = any> = ((reason: ExecaError) => T | PromiseLike<T>);
type OnRejected<T = any> = OnRejectedFunc<T> | null | undefined;

/**
 * NOTE: This function is purposely NOT async.
 * The childProc object that execa returns gives the caller a lot of flexibility
 * in how to consume the results, especially including consuming the
 * output streams in real time, without waiting for the target process to exit.
 * So we take care to pass exactly that object back, NOT a promise to that object.
 */
export function run(action: string, options: InternalOptions & AnyOptions, args?: string[]): ExecaChildProcess {
    // tslint:disable-next-line:prefer-const
    let { boolNoArgOptions = [], loglevel, pipeOutput, ...opts } = { ...commonDefaults, ...options };

    boolNoArgOptions.push(...noArgOptions);
    const finalOpts = optionsBoolToUndef(opts, boolNoArgOptions);

    const finalArgs = [action];
    if (loglevel === "silent") finalArgs.push("--silent");
    if (loglevel === "verbose") finalArgs.push("--verbose");

    for (const opt of Object.keys(finalOpts)) {
        const flag = "--" + decamelize(opt, "-");
        finalArgs.push(flag);
        const val = (finalOpts as any)[opt];
        if (val !== undefined) finalArgs.push(val.toString());
    }
    if (args) finalArgs.push(...args);

    const env = { PATH: npmPath };

    const childProc = execa("yarn", finalArgs, {
        all: true,
        env,
        stripFinalNewline: false,
    });
    const logStop = logStart(childProc.pid, finalArgs);

    if (pipeOutput) {
        childProc.stdout.pipe(process.stdout);
        childProc.stderr.pipe(process.stdout);
    }

    // Make the error message slightly more helpful. But if we want to
    // return the original childProc object, we have to do a little
    // extra work to insert our translation into the promise chain rather
    // than just adding a .catch handler.
    const translateError = (err: ExecaError) => {
        err.message = `yarn ${action} failed: ${err.message}\n${err.all}`;
        return Promise.reject(err);
    };
    insertCatch(childProc, translateError);

    // This "then" creates a separate chain and that's ok
    childProc.then((child) => logStop(child.all), (err) => logStop(err.all || err.message || err));

    return childProc;
}

function insertCatch(childProc: ExecaChildProcess, catcher: OnRejectedFunc) {
    const origCatch = childProc.catch;
    const origThen = childProc.then;
    childProc.then = (onFulfilled, onRejected) => {
        try {
            return origThen(onFulfilled, catcher).catch(onRejected);
        } catch (err) {
            return catcher(err);
        }
    };
    childProc.catch = (onRejected: OnRejected) => {
        try {
            return origCatch(catcher).catch(onRejected);
        } catch (err) {
            return catcher(err);
        }
    };
}

function optionsBoolToUndef(options: AnyOptions, keys: string[]): AnyOptions {
    const ret = { ...options };
    for (const k of keys) {
        if (ret[k]) ret[k] = undefined;
        else delete ret[k];
    }
    return ret;
}

export interface JsonMessage {
    type: string;
    data: any;
}

export function parseJsonMessages(output: string, typeFilter?: string): JsonMessage[] {
    const lines = output.split(/\r?\n/g);
    let objs: JsonMessage[] = lines.map((l) => {
        try {
            return JSON.parse(l);
        } catch (e) {
            return { type: "MessageError", data: e.message };
        }
    });
    if (typeFilter) objs = objs.filter((o) => o != null && o.type === typeFilter);
    return objs;
}

function logStart(pid: number, args: string[]) {
    const logger = ciMaybeCreateLogger(`yarn-${pid}`);
    if (!logger) return () => {/* */};

    const argstr = `yarn ${args.join(" ")}`;
    logger.log(`RUN ${argstr}`);
    logger.logps();
    return (output: any) => {
        logger.log(`DONE ${argstr}`);
        logger.log(`OUTPUT`, output);
        logger.close();
    };
}
