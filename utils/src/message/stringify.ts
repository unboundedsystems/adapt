import stream from "stream";
import { Message, MessageType } from "./common";

export interface MessageStringOptions {
    timestamp?: boolean;
    type?: boolean;
}

const defaultOptions: MessageStringOptions = {
    timestamp: true,
    type: true,
};

export function messagesToString(msgs: ReadonlyArray<Message>, filter?: MessageType,
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
    errStream: stream.Writable | undefined) {

    switch (msg.type) {
        case MessageType.error:
            if (errStream) errStream.write(messageToString(msg) + "\n");
            break;
        case MessageType.info:
        case MessageType.warning:
            if (outStream) outStream.write(messageToString(msg) + "\n");
            break;
    }
}
