import { ChildProcess } from "child_process";
import * as db from "debug";
import * as ev2 from "eventemitter2";  // Only needed for type
import { LocalStore, Message, MessageLogger } from "./common";
import { MessageStreamer } from "./message_streamer";
// tslint:disable-next-line:no-var-requires
const IPCEE = require("ipcee");
import * as net from "net";
import * as stream from "stream";

const debug = db("@usys/utils:message:fork");

declare class IPC extends ev2.EventEmitter2 {
    send(event: string, ...args: any[]): IPC;
}

interface MLEventMessage {
    type: "MLEventMessage";
    msg: Message;
}

interface MLEventOutstream {
    type: "MLEventOutstream";
    port?: number;
}

interface MLEventErrstream {
    type: "MLEventErrstream";
    port?: number;
}

interface MLEventReady {
    type: "MLEventReady";
}

type MLEvent = MLEventMessage | MLEventOutstream | MLEventErrstream | MLEventReady;

// Runs in parent to create the server side of the stream
async function createStreamServer(dest: stream.Writable): Promise<number> {

    const server = net.createServer((sock) => {
        debug("client connected");
        server.close(); // Only one connection
        sock.on("end", () => {
            debug("client disconnected");
        });
        sock.pipe(dest, { end: false });
    });
    server.on("error", (err) => {
        // handle errors here
        throw err;
    });

    return new Promise<number>((resolve, reject) => {
        try {
            // grab an arbitrary unused port.
            server.listen(() => {
                const addr = server.address();
                debug("opened server on", addr);
                if (typeof addr === "string") {
                    // Should only happen for unix/IPC sockets
                    reject(new Error(`Internal error: unexpected socket address '${addr}'`));
                    return;
                }
                resolve(addr.port);
            });
        } catch (e) {
            reject(e);
        }
    });
}

// Both parent and child
function processSend(ipc: IPC, event: MLEvent) {
    debug("pid", process.pid, "sending", event);
    ipc.send(event.type, event);
}

// Both parent and child
async function waitForMessage<T extends MLEvent>(ipc: IPC, type: T["type"]) {
    debug("pid", process.pid, "waiting for", type);
    return new Promise<T>((resolve) => ipc.once(type, resolve));
}

export async function logFromChildProcess(mLogger: MessageLogger, child: ChildProcess) {
    debug("Parent: pid", process.pid, "logFromChildProcess");
    const ipc = IPCEE(child);

    const outPort = mLogger.outStream && await createStreamServer(mLogger.outStream);
    const errPort = mLogger.errStream && await createStreamServer(mLogger.errStream);

    ipc.on("MLEventMessage", (childMsg: MLEventMessage) => {
        mLogger.message(childMsg.msg);
    });

    ipc.once("MLEventReady", () => {
        debug("pid", process.pid, "got ready");

        processSend(ipc, {
            type: "MLEventOutstream",
            port: outPort,
        });
        processSend(ipc, {
            type: "MLEventErrstream",
            port: errPort,
        });
    });
}

export class ParentStore extends LocalStore {
    ipc = IPCEE(process); // IPC to parent

    store(msg: Message) {
        super.store(msg);
        processSend(this.ipc, {
            type: "MLEventMessage",
            msg
        });
    }
}

// Called from child to get the output/error port to connect to
async function getAddrFromParent
    <T extends MLEventErrstream | MLEventOutstream>
    (ipc: IPC, type: T["type"]): Promise<number | undefined> {

    const { port } = await waitForMessage<T>(ipc, type);
    return port;
}

// Called from child to get writable stream
function getStream(port: number | undefined): Promise<stream.Writable | undefined> {
    debug(`Getting stream for`, port);
    return new Promise<stream.Writable>((resolve) => {
        if (port === undefined) {
            resolve(port);
            return;
        }
        const sock = net.createConnection(port, "localhost", () => {
            debug(`Got stream for ${port}`);
            resolve(sock);
        });
    });
}

export async function loggerToParentProcess(from: string): Promise<MessageLogger> {
    debug("Child: pid", process.pid, "loggerToParentProcess");
    const ipc = IPCEE(process); // IPC to parent

    const outStreamAddrP = getAddrFromParent(ipc, "MLEventOutstream");
    const errStreamAddrP = getAddrFromParent(ipc, "MLEventErrstream");

    processSend(ipc, {
        type: "MLEventReady"
    });
    const ports = await Promise.all([outStreamAddrP, errStreamAddrP]);

    debug("Got ports:", ports);

    return new MessageStreamer(from, {
        outStream: await getStream(ports[0]),
        errStream: await getStream(ports[1]),
        store: new ParentStore(),
    });
}
