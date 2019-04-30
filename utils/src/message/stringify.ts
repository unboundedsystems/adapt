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
