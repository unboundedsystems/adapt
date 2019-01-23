import ee2 from "eventemitter2";
import * as stream from "stream";
import { hasValidProps, validateProps, ValidationError } from "../type_check";

export type Logger = (arg: any, ...args: any[]) => void;

export enum MessageType {
    info = "info",
    warning = "warning",
    error = "error",
    task = "task",
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
        case "task":
            return true;
    }
    return false;
}

export function badMessageType(x: never): never {
    throw new Error(`Invalid MessageType: ${x}`);
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
    task: number;
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
    readonly isMessageLogger: true;
    createChild: (this: MessageLogger, id: string) => this;
}

export function isMessageLogger(val: unknown): val is MessageLogger {
    return (val && typeof val === "object" && (val as any).isMessageLogger === true);
}

export interface MessageStore {
    readonly messages: ReadonlyArray<Message>;
    store: (this: MessageStore, msg: Message) => void;
    readonly summary: MessageSummary;
}

export class LocalStore implements MessageStore {
    readonly messages: Message[] = [];
    readonly summary: MessageSummary = {
        info: 0,
        warning: 0,
        error: 0,
        task: 0,
    };
    store(msg: Message) {
        this.messages.push(msg);
        this.summary[msg.type]++;
    }
}

/**
 * MessageEmitter events are namespaced using EventEmitter2.
 * For message-related events, the first component is "message".
 * The remaining components are the task ID.
 *
 * To listen to messages from all tasks:
 *   taskEmitter.on(`message:**`, callback);
 * To listen to all messages for a specific task:
 *   taskEmitter.on(`message:${taskId}`, callback);
 */
export interface MessageEmitter extends ee2.EventEmitter2 {
    on(event: string | string[], listener: MessageListener): this;
    on(event: "close", listener: () => void): this;

    once(event: string | string[], listener: MessageListener): this;
    once(event: "close", listener: () => void): this;

    prependListener(event: string | string[], listener: MessageListener): this;
    prependListener(event: "close", listener: () => void): this;

    prependOnceListener(event: string | string[], listener: MessageListener): this;
    prependOnceListener(event: "close", listener: () => void): this;

    emit(event: string, msg: Message): boolean;
    listeners(event: string | string[]): MessageListener[];
}
export type MessageListener = (msg: Message) => void;

export enum TaskState {
    Created = "Created",
    Started = "Started",
    Complete = "Complete",
    Skipped = "Skipped",
    Failed = "Failed",
}

export enum TaskStatus {
    Status = "Status",
    ChildGroup = "ChildGroup",
}

export type TaskEvent = TaskState | TaskStatus;
// tslint:disable-next-line:variable-name
export const TaskEvent = { ...TaskStatus, ...TaskState };

export function badTaskEvent(event: never): never {
    throw new Error(`Invalid TaskEvent ${event}`);
}

function isTaskEvent(event: unknown): event is TaskEvent {
    const ev = event as TaskEvent;
    switch (ev) {
        case TaskEvent.Created:
        case TaskEvent.Started:
        case TaskEvent.Complete:
        case TaskEvent.Skipped:
        case TaskEvent.Failed:
        case TaskEvent.Status:
        case TaskEvent.ChildGroup:
            return true;
        default:
            return badTaskEvent(ev);
    }
}

/**
 * TaskEmitter events are namespaced using EventEmitter2.
 * For task-related events, the first component is "task". The second
 * component is the task event type (see TaskEvent).
 * The remaining components are the task ID.
 *
 * To listen to Created events for all tasks:
 *   taskEmitter.on(`task:Created:**`, callback);
 * To listen to all events for a specific task:
 *   taskEmitter.on(`task:*:${taskId}`, callback);
 * To listen to all events for all tasks:
 *   taskEmitter.on(`task:**`, callback);
 */
export interface TaskEmitter extends ee2.EventEmitter2 {
    on(event: string | string[], listener: TaskListener): this;
    on(event: "close", listener: () => void): this;

    once(event: string | string[], listener: TaskListener): this;
    once(event: "close", listener: () => void): this;

    prependListener(event: string | string[], listener: TaskListener): this;
    prependListener(event: "close", listener: () => void): this;

    prependOnceListener(event: string | string[], listener: TaskListener): this;
    prependOnceListener(event: "close", listener: () => void): this;

    emit(event: string, msg: Message): boolean;
    listeners(event: string | string[]): TaskListener[];
}
export type TaskListener =
    (event: TaskEvent, status: string | undefined, from: string) => void;

/**
 * Task message is one of these two forms:
 *   [Event]
 *   [Event]: Some status message
 */
const taskRegex = /^\[(.+?)\](?::\s*(.+))?$/;

export function parseTaskContent(content: string) {
    const match = content.match(taskRegex);
    if (!match) throw new Error(`Task message not understood: ${content}`);

    const event = match[1];
    if (!isTaskEvent(event)) throw new Error(`Task event not understood: ${event}`);

    return {
        event,
        status: match[2],
    };
}

export interface MessageClient {
    info: MessageEmitter;
    warning: MessageEmitter;
    error: MessageEmitter;
    task: TaskEmitter;
    fromStream?: (this: MessageClient, inputStream: stream.Readable) => void;
    readonly isMessageClient: true;
}

export function isMessageClient(val: unknown): val is MessageClient {
    return (val && typeof val === "object" && (val as any).isMessageClient === true);
}
