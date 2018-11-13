import * as stream from "stream";
import { hasValidProps, validateProps, ValidationError } from "../type_check";

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
    readonly messages: ReadonlyArray<Message>;
    readonly summary: MessageSummary;
    readonly from: string;
    info: Logger;
    warning: Logger;
    error: Logger;
    log: (type: MessageType, arg: any, ...args: any[]) => void;
    append: (this: MessageLogger, toAppend: Message[]) => void;
    message: (this: MessageLogger, msg: Message) => void;
    outStream?: stream.Writable;
    errStream?: stream.Writable;
}

export interface MessageStore {
    messages: ReadonlyArray<Message>;
    store: (this: MessageStore, msg: Message) => void;
}

export class LocalStore implements MessageStore {
    messages: Message[] = [];
    store(msg: Message) {
        this.messages.push(msg);
    }
}
