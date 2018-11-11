import * as stream from "stream";
import { format } from "util";

import { hasValidProps, validateProps, ValidationError } from "./type_check";

export type Logger = (arg: any, ...args: any[]) => void;

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

const msgProps = {
    type: "string",
    content: "string",
    from: "string",
    timestamp: "number",
};

function validType(val: unknown) {
    switch (val) {
        case "info":
        case "warning":
        case "error":
            return true;
    }
    return false;
}

export function isMessage(val: unknown): val is Message {
    if (!hasValidProps(val, msgProps)) return false;
    return validType((val as any).type);
}

export function validateMessage(val: unknown) {
    validateProps("Message", val, msgProps);
    if (!validType((val as any).type)) {
        throw new ValidationError("Message", `invalid 'type' property value '${(val as any).type}'`);
    }
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

export interface Options {
    timestamp?: boolean;
    type?: boolean;
}

const defaultOptions: Options = {
    timestamp: true,
    type: true,
};

export function messagesToString(msgs: Message[], filter?: MessageType,
                                 options = defaultOptions): string {
    if (filter) msgs = msgs.filter((m) => m.type === filter);
    return msgs.map((m) => messageToString(m, options)).join("\n");
}

export function messageToString(msg: Message, options = defaultOptions): string {
    let ret = "";
    if (options.timestamp) ret += (new Date(msg.timestamp)).toUTCString() + " ";
    ret += `[${msg.from}] `;
    if (options.type) ret += `${msg.type.toUpperCase()}`;
    ret += `: ${msg.content}`;
    return ret;
}

export function getErrors(msgs: Message[]): string {
    return messagesToString(msgs, MessageType.error,
                            { timestamp: false, type: false });
}

export function getWarnings(msgs: Message[]): string {
    return messagesToString(msgs, MessageType.warning,
                            { timestamp: false, type: false });
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

