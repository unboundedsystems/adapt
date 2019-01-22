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

export interface MessageStreamServerOptions {
    parent?: MessageStreamServer;
    outStream?: stream.Writable;
    store?: MessageStore;
}

export class MessageStreamServer implements MessageLogger {
    readonly from: string;
    readonly outStream: stream.Writable;
    protected store: MessageStore;

    constructor(id: string, options: MessageStreamServerOptions = {}) {
        const outStream = options.outStream || (options.parent && options.parent.outStream);
        if (!outStream) {
            throw new Error(`MessageStreamServer: either parent or outStream must be specified`);
        }
        this.outStream = outStream;
        this.store =
            options.store ||
            (options.parent && options.parent.store) ||
            new LocalStore();
        this.from = options.parent ? `${options.parent.from}:${id}` : id;
    }

    get messages() {
        return this.store.messages;
    }

    get summary() {
        return this.store.summary;
    }

    end = () => {
        this.outStream.end();
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
        this.outStream.write(JSON.stringify(msg) + "\n");
    }
}
