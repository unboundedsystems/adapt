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

import stream from "stream";
import { Message, MessageType } from "./common";

export interface MessageStringOptions {
    from?: boolean;
    timestamp?: boolean;
    type?: boolean;
}

const defaultOptions = {
    from: true,
    timestamp: true,
    type: true,
};

export function messagesToString(msgs: ReadonlyArray<Message>, filter?: MessageType,
                                 options: MessageStringOptions = {}): string {
    if (filter) msgs = msgs.filter((m) => m.type === filter);
    return msgs.map((m) => messageToString(m, options)).join("\n");
}

export function messageToString(msg: Message, options: MessageStringOptions = {}): string {
    const opts = { ...defaultOptions, ...options };
    if (!(opts.from || opts.timestamp || opts.type)) return msg.content;

    let ret = "";
    if (opts.timestamp) ret += (new Date(msg.timestamp)).toUTCString() + " ";
    if (opts.from) ret += `[${msg.from}] `;
    if (opts.type) ret += `${msg.type.toUpperCase()}`;
    ret += `: ${msg.content}`;
    return ret;
}

export function getErrors(msgs: ReadonlyArray<Message>): string {
    return messagesToString(msgs, MessageType.error,
                            { timestamp: false, type: false });
}

export function getWarnings(msgs: ReadonlyArray<Message>): string {
    return messagesToString(msgs, MessageType.warning,
                            { timestamp: false, type: false });
}

export function logToStreams(
    msg: Message,
    outStream: stream.Writable | undefined,
    errStream: stream.Writable | undefined,
    options: MessageStringOptions = {}) {

    switch (msg.type) {
        case MessageType.error:
            if (errStream) errStream.write(messageToString(msg, options) + "\n");
            break;
        case MessageType.info:
        case MessageType.warning:
            if (outStream) outStream.write(messageToString(msg, options) + "\n");
            break;
    }
}
