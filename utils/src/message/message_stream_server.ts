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

import { isFunction, isString } from "lodash";
import { Writable } from "stream";
import { format } from "util";
import { Constructor } from "../common_types";
import {
    LocalStore,
    Logger,
    Message,
    MessageLogger,
    MessageStore,
    MessageType
} from "./common";

export interface MessageStreamServerOptions {
    parent?: MessageStreamServer;
    outStream?: Writable;
    store?: MessageStore;
    interceptStdio?: boolean;
}

export type WriteCallback = (error: Error | null | undefined) => void;

const intercepted = new Map<Writable, Writable["write"]>();

export class MessageStreamServer implements MessageLogger {
    readonly from: string;
    readonly outStream: Writable;
    readonly isMessageLogger: true = true;
    protected store: MessageStore;
    protected write: Writable["write"];
    protected intercepting = false;

    constructor(id: string, options: MessageStreamServerOptions = {}) {
        const outStream = options.outStream || (options.parent && options.parent.outStream);
        if (!outStream) {
            throw new Error(`MessageStreamServer: either parent or outStream must be specified`);
        }
        this.outStream = outStream;
        this.store =
            options.store ||
            (options.parent && options.parent.store) ||
            new LocalStore();
        this.from = options.parent ? `${options.parent.from}:${id}` : id;

        this.write = options.parent ? options.parent.write : outStream.write.bind(outStream);
        if (options.interceptStdio) {
            this.intercept(process.stdout, MessageType.stdout);
            this.intercept(process.stderr, MessageType.stderr);
            this.intercepting = true;
        }
    }

    get messages() {
        return this.store.messages;
    }

    get summary() {
        return this.store.summary;
    }

    end = () => {
        this.outStream.end();
    }

    info: Logger = (arg: any, ...args: any[]) => {
        this.log(MessageType.info, arg, ...args);
    }
    warning: Logger = (arg: any, ...args: any[]) => {
        this.log(MessageType.warning, arg, ...args);
    }
    error: Logger = (arg: any, ...args: any[]) => {
        this.log(MessageType.error, arg, ...args);
    }

    log = (type: MessageType, arg: any, ...args: any[]) => {
        const m = {
            type,
            timestamp: Date.now(),
            from: this.from,
            content: format(arg, ...args),
        };

        this.message(m);
    }

    // FIXME(mark): This function is meant to help with the transition period
    // where some areas of code have not yet been updated to use a
    // MessageLogger. Any use of this function should be replaced with
    // direct use of MessageLogger instead.
    append(toAppend: Message[]) {
        for (const m of toAppend) { this.message(m); }
    }

    message = (msg: Message, cb?: WriteCallback): boolean => {
        this.store.store(msg);
        return this.write(JSON.stringify(msg) + "\n", cb);
    }

    createChild(id: string): this {
        return new (this.constructor as Constructor<this>)(id, {
            parent: this,
            interceptConsole: false,
        });
    }

    stopIntercept() {
        if (!this.intercepting || intercepted.size === 0) return;
        intercepted.forEach((origWrite, stream) => {
            stream.write = origWrite;
        });
        intercepted.clear();
        this.intercepting = false;
    }

    private intercept(toIntercept: Writable, type: MessageType) {
        if (intercepted.has(toIntercept)) {
            throw new Error(`Only one stdio interceptor can be used at a time`);
        }
        intercepted.set(toIntercept, toIntercept.write);

        // write(chunk: any, cb?: (error: Error | null | undefined) => void): boolean;
        // write(chunk: any, encoding?: string, cb?: (error: Error | null | undefined) => void): boolean;
        toIntercept.write = (chunk: any, encodingOrCb?: string | WriteCallback, cb?: WriteCallback): boolean => {
            if (isFunction(encodingOrCb)) cb = encodingOrCb;
            if (!isString(chunk)) chunk = chunk.toString();
            return this.message({
                type,
                timestamp: Date.now(),
                from: this.from,
                content: chunk,
            }, cb);
        };
    }
}
