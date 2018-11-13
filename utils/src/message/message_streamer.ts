import * as stream from "stream";
import { format } from "util";
import {
    LocalStore,
    Logger,
    Message,
    MessageLogger,
    MessageStore,
    MessageSummary,
    MessageType
} from "./common";
import { messageToString } from "./stringify";

export interface MessageStreamerOptions {
    outStream?: stream.Writable;
    errStream?: stream.Writable;
    store?: MessageStore;
}

export class MessageStreamer implements MessageLogger {
    summary: MessageSummary = {
        info: 0,
        warning: 0,
        error: 0,
    };

    outStream?: stream.Writable;
    errStream?: stream.Writable;
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

        switch (type) {
            case MessageType.error:
                if (this.errStream) this.errStream.write(messageToString(m) + "\n");
                break;
            case MessageType.info:
            case MessageType.warning:
                if (this.outStream) this.outStream.write(messageToString(m) + "\n");
                break;
        }
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
        this.updateSummary(msg.type);
        this.store.store(msg);
    }

    protected updateSummary(type: MessageType) { this.summary[type]++; }
}
