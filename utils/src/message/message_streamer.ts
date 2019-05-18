import stream from "stream";
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
import { logToStreams, MessageStringOptions } from "./stringify";

export interface MessageStreamerOptions {
    outStream?: stream.Writable;
    errStream?: stream.Writable;
    parent?: MessageStreamer;
    store?: MessageStore;
    outputOptions?: MessageStringOptions;
}

export class MessageStreamer implements MessageLogger {
    readonly outStream?: stream.Writable;
    readonly errStream?: stream.Writable;
    readonly from: string;
    readonly isMessageLogger: true = true;
    readonly outputOptions: MessageStringOptions;
    protected store: MessageStore;

    constructor(id: string, options: MessageStreamerOptions = {}) {
        this.outStream = options.outStream || (options.parent && options.parent.outStream);
        this.errStream =
            options.errStream ||
            (options.parent && options.parent.errStream) ||
            this.outStream;
        this.store =
            options.store ||
            (options.parent && options.parent.store) ||
            new LocalStore();
        this.from = options.parent ? `${options.parent.from}:${id}` : id;
        this.outputOptions =
            options.outputOptions ||
            (options.parent && options.parent.outputOptions) ||
            {};
    }

    get messages() {
        return this.store.messages;
    }

    get summary() {
        return this.store.summary;
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
        logToStreams(m, this.outStream, this.errStream, this.outputOptions);
        this.message(m);
    }

    // FIXME(mark): This function is meant to help with the transition period
    // where some areas of code have not yet been updated to use a
    // MessageLogger. Any use of this function should be replaced with
    // direct use of MessageLogger instead.
    append(toAppend: Message[]) {
        for (const m of toAppend) { this.message(m); }
    }

    message = (msg: Message) => {
        this.store.store(msg);
    }

    createChild(id: string): this {
        return new (this.constructor as Constructor<this>)(id, { parent: this });
    }
}
