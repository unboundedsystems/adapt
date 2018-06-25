import indent = require("indent-string");
import typeName = require("type-name");
import { inspect } from "util";
// tslint:disable-next-line:no-var-requires
const writeStream = require("flush-write-stream");

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
                        return trunc(simpleStringify(arg), 40);
                    }).join();
                    log(`${fname}(${a})`);

                    nesting++;
                    const result = propDesc.value.apply(this, args);
                    nesting--;
                    const r = trunc(simpleStringify(result), 20);
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
