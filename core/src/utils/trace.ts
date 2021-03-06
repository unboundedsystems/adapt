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

import indent = require("indent-string");
import typeName = require("type-name");
import { inspect } from "util";
// tslint:disable-next-line:no-var-requires
const writeStream = require("flush-write-stream");

const argsTruncLen = 80;
const returnTruncLen = 20;

function trunc(s: string, max: number): string {
    if (s && s.length > max) {
        return s.slice(0, max) + "...";
    }
    return s;
}

let nesting = 0;

function isBuffer(_data: any, encoding: string): _data is Buffer {
    return encoding === "buffer";
}
const traceWritable = writeStream(
    (data: any, encoding: string, cb: () => void) => {
        if (!isBuffer(data, encoding)) {
            throw new Error(`Unhandled encoding type in trace.log`);
        }
        process.stdout.write(indent(data.toString(), 2 * nesting));
        cb();
    });
// An instance of Console that indents its output according to nesting level
// tslint:disable-next-line:no-console
const _console = new console.Console(traceWritable);

function log(...args: any[]) {
    _console.log(...args);
}

function simpleStringify(obj: any): string {
    return inspect(obj, {depth: 1, maxArrayLength: 1, breakLength: Infinity});
}

// Trace each call to a class method
export function tracef(enable: boolean) {
    if (enable) {
        return function logMethod(_target: object, propKey: string,
                                  propDesc: PropertyDescriptor) {
            return {
                value(...args: any[]) {
                    let objname;
                    if (this) {
                        objname = typeName(this);
                        const id = (this as any)._id;
                        if (id) objname += id;
                    } else {
                        objname = "null";
                    }

                    const fname = `${objname}.${propKey}`;
                    const a = args.map((arg) => {
                        return trunc(simpleStringify(arg), argsTruncLen);
                    }).join();
                    log(`${fname}(${a})`);

                    nesting++;
                    const result = propDesc.value.apply(this, args);
                    nesting--;
                    const r = trunc(simpleStringify(result), returnTruncLen);
                    log(`${fname} => ${r}`);
                    return result;
                }
            };
        };
    } else {
        // tslint:disable-next-line:no-empty
        return function noLog(target: object, _key: string, _val: any) {};
    }
}

export function trace(enable: boolean, ...args: any[]): void {
    if (!enable) return;
    log(...args);
}

export function traceLazy(enable: boolean, argFunc: () => any[]): void {
    if (!enable) return;
    const args = argFunc();
    log(...args);
}
