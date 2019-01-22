import ee2 from "eventemitter2";
import readline from "readline";
import stream from "stream";
import {
    badMessageType,
    isMessage,
    MessageClient,
    MessageEmitter,
    MessageType,
    parseTaskContent,
    TaskEmitter,
} from "./common";
import { logToStreams } from "./stringify";

type Emitters = Partial<Record<MessageType, ee2.EventEmitter2>>;

export interface MessageStreamClientOptions {
    inputStream?: stream.Readable;
    outStream?: stream.Writable;
    errStream?: stream.Writable;
}

export class MessageStreamClient implements MessageClient {
    private associated = false;
    private emitters: Emitters = {};
    private outStream?: stream.Writable;
    private errStream?: stream.Writable;

    constructor(options: MessageStreamClientOptions = {}) {
        if (options.outStream) this.outStream = options.outStream;
        if (options.errStream) this.errStream = options.errStream;
        if (options.inputStream) this.fromStream(options.inputStream);
    }

    fromStream(input: stream.Readable) {
        if (this.associated) {
            throw new Error(`MessageStreamClient already associated with an input stream`);
        }
        this.associated = true;
        const rl = readline.createInterface({
            input,
            crlfDelay: Infinity,
        });
        rl.on("line", this.inputMessage);
        rl.on("close", this.inputClose);
    }

    get info(): MessageEmitter { return this.emitter(MessageType.info); }
    get warning(): MessageEmitter { return this.emitter(MessageType.warning); }
    get error(): MessageEmitter { return this.emitter(MessageType.error); }
    get task(): TaskEmitter { return this.emitter(MessageType.task); }

    private inputMessage = (line: string): void => {
        const msg = JSON.parse(line);
        if (!isMessage(msg)) throw new Error(`Invalid message: ${line}`);
        const em = this.emitter(msg.type);

        switch (msg.type) {
            case MessageType.info:
            case MessageType.error:
            case MessageType.warning:
                logToStreams(msg, this.outStream, this.errStream);
                em.emit(`message:${msg.from}`, msg);
                break;
            case MessageType.task:
                const { event, status } = parseTaskContent(msg.content);
                em.emit(`task:${event}:${msg.from}`, event, status);
                break;
            default:
                return badMessageType(msg.type);
        }
    }

    private inputClose = () => {
        for (const name of Object.keys(this.emitters)) {
            const em = this.emitters[name as MessageType];
            if (em) em.emit("close");
        }
    }

    private emitter(name: MessageType) {
        let em = this.emitters[name];
        if (!em) {
            em = new ee2.EventEmitter2({
                wildcard: true,
                delimiter: ":",
            });
            this.emitters[name] = em;
        }
        return em;
    }
}
