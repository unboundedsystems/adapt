import stream from "stream";
import { format } from "util";
import {
    LocalStore,
    Logger,
    Message,
    MessageLogger,
    MessageStore,
    MessageType
} from "./common";
import { logToStreams } from "./stringify";

export interface MessageStreamerOptions {
    outStream?: stream.Writable;
    errStream?: stream.Writable;
    store?: MessageStore;
}

export class MessageStreamer implements MessageLogger {
    outStream?: stream.Writable;
    errStream?: stream.Writable;
    readonly isMessageLogger: true = true;
    protected store: MessageStore;

    constructor(public from: string, options: MessageStreamerOptions = {}) {
        this.outStream = options.outStream;
        this.errStream = (options.outStream != null && options.errStream == null) ?
            options.outStream :
            options.errStream;
        this.store = options.store || new LocalStore();
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
        logToStreams(m, this.outStream, this.errStream);
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
}
