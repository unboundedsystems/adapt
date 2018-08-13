import { Message, MessageType } from "../types/adapt_shared";

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
