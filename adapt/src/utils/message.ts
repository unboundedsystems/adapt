import * as stream from "stream";
import { format } from "util";
import { Logger } from "../type_support";

export enum MessageType {
    info = "info",
    warning = "warning",
    error = "error",
}
export interface Message {
    type: MessageType;
    timestamp: number;
    from: string;
    content: string;
}

export interface MessageSummary {
    info: number;
    warning: number;
    error: number;
}

export interface MessageLogger {
    messages: Message[];
    summary: MessageSummary;
    info: Logger;
    warning: Logger;
    error: Logger;
    log: (type: MessageType, arg: any, ...args: any[]) => void;
    append: (this: MessageLogger, toAppend: Message[]) => void;
}

export function messagesToString(msgs: Message[], filter?: MessageType): string {
    if (filter) msgs = msgs.filter((m) => m.type === filter);
    return msgs.map((m) => messageToString(m)).join("\n");
}

export function messageToString(msg: Message): string {
    const dateStr = (new Date(msg.timestamp)).toUTCString();
    return `${dateStr} [${msg.from}] ${msg.type.toUpperCase()}: ${msg.content}`;
}

export class MessageStreamer implements MessageLogger {
    messages: Message[] = [];
    summary: MessageSummary = {
        info: 0,
        warning: 0,
        error: 0,
    };

    constructor(public from: string,
                protected outStream?: stream.Writable,
                protected errStream?: stream.Writable) {
        if (outStream != null && errStream == null) {
            this.errStream = outStream;
        }
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
        this.updateSummary(type);

        const m = {
            type,
            timestamp: Date.now(),
            from: this.from,
            content: format(arg, ...args),
        };

        switch (type) {
            case MessageType.error:
                if (this.errStream) this.errStream.write(messageToString(m) + "\n");
                break;
            case MessageType.info:
            case MessageType.warning:
                if (this.outStream) this.outStream.write(messageToString(m) + "\n");
                break;
        }
        this.messages.push(m);
    }

    // FIXME(mark): This function is meant to help with the transition period
    // where some areas of code have not yet been updated to use a
    // MessageLogger. Any use of this function should be replaced with
    // direct use of MessageLogger instead.
    append(toAppend: Message[]) {
        for (const m of toAppend) { this.updateSummary(m.type); }
        this.messages = this.messages.concat(toAppend);
    }

    protected updateSummary(type: MessageType) { this.summary[type]++; }
}
