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

import ee2 from "eventemitter2";
import readline from "readline";
import stream from "stream";
import {
    badMessageType,
    isMessage,
    Message,
    MessageClient,
    MessageEmitter,
    MessageType,
    parseTaskContent,
    TaskEmitter,
} from "./common";
import { logToStreams } from "./stringify";

type Emitters = Partial<Record<MessageType, ee2.EventEmitter2>>;

export interface MessageStreamClientOptions {
    inputStream?: stream.Readable;
    outStream?: stream.Writable;
    errStream?: stream.Writable;
}

export class MessageStreamClient implements MessageClient {
    readonly isMessageClient: true = true;
    outStream?: stream.Writable;
    errStream?: stream.Writable;
    private emitters: Emitters = {};

    constructor(options: MessageStreamClientOptions = {}) {
        if (options.outStream) this.outStream = options.outStream;
        if (options.errStream) this.errStream = options.errStream;
        if (options.inputStream) this.fromStream(options.inputStream);
    }

    fromStream(input: stream.Readable) {
        const rl = readline.createInterface({
            input,
            crlfDelay: Infinity,
        });
        rl.on("line", this.inputMessage);
    }

    get info(): MessageEmitter { return this.emitter(MessageType.info); }
    get warning(): MessageEmitter { return this.emitter(MessageType.warning); }
    get error(): MessageEmitter { return this.emitter(MessageType.error); }
    get task(): TaskEmitter { return this.emitter(MessageType.task); }

    private inputMessage = (line: string): void => {
        let msg: Message;
        try {
            msg = JSON.parse(line);
            if (!isMessage(msg)) throw new Error(`Failed validation`);
        } catch (err) {
            // Turn the message we didn't parse into an error
            msg = {
                timestamp: Date.now(),
                type: MessageType.error,
                content: `Invalid Message (${err.message}): ${line}`,
                from: "system.logger",
            };
        }

        const em = this.emitter(msg.type);

        switch (msg.type) {
            case MessageType.info:
            case MessageType.error:
            case MessageType.warning:
                logToStreams(msg, this.outStream, this.errStream);
                em.emit(`message:${msg.from}`, msg);
                break;
            case MessageType.task:
                const { event, status } = parseTaskContent(msg.content);
                em.emit(`task:${event}:${msg.from}`, event, status, msg.from);
                break;
            case MessageType.stdout:
                if (this.outStream) this.outStream.write(msg.content);
                break;
            case MessageType.stderr:
                if (this.errStream) this.errStream.write(msg.content);
                break;
            default:
                return badMessageType(msg.type);
        }
    }

    private emitter(name: MessageType) {
        let em = this.emitters[name];
        if (!em) {
            em = new ee2.EventEmitter2({
                wildcard: true,
                delimiter: ":",
            });
            this.emitters[name] = em;
        }
        return em;
    }
}
