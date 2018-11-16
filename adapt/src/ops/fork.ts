import { logFromChildProcess, MessageStreamer } from "@usys/utils";
import db from "debug";
// tslint:disable-next-line:no-var-requires
const forkRequire = require("fork-require");
import { InternalError } from "../error";
import { WithLogger } from "./common";

const debug = db("adapt:ops:fork");

type FuncWithLogger<Ret> = (opts: WithLogger, ...args: any[]) => Promise<Ret>;

function forkWithLogger<Ret, F extends FuncWithLogger<Ret>>(
    func: F, filename: string, funcName = func.name) {

    if (debug.enabled && process.env.ADAPT_OP_FORKED) {
        return async (opts: WithLogger, ...args: any[]): Promise<Ret> => {
            debug(`${funcName}: child (PID ${process.pid})`);
            return func(opts, ...args);
        };
    }

    if (process.env.ADAPT_NO_FORK || process.env.ADAPT_OP_FORKED) return func;

    return async (opts: WithLogger, ...args: any[]): Promise<Ret> => {
        debug(`${funcName}: parent (PID ${process.pid})`);

        const forked = forkRequire(filename, {
            env: { ...process.env, ADAPT_OP_FORKED: true },
            stdio: [ "inherit", "pipe", "pipe", "ipc" ]
        });

        // Ensure output from child goes to parent's output streams (which
        // might not actually stream to real stdout/stderr file descriptors).
        forked._childProcess.stdout.pipe(process.stdout, { end: false });
        forked._childProcess.stderr.pipe(process.stderr, { end: false });

        const logger = opts.logger || new MessageStreamer("deploy", {
            outStream: process.stdout,
            errStream: process.stderr,
        });
        try {
            await logFromChildProcess(logger, forked._childProcess);

            return await forked[funcName](opts, ...args);
        } finally {
            forked._childProcess.kill();
        }
    };
}

export interface ExportsWithLogger {
    [ prop: string ]: FuncWithLogger<any>;
}

export function forkExports<Exp extends ExportsWithLogger>(
    mod: NodeModule, keys: (keyof Exp)[] | keyof Exp) {

    const exps = mod.exports;

    if (typeof exps !== "object") throw new InternalError(`Invalid exports obj`);
    if (!Array.isArray(keys)) keys = [ keys ];

    for (const prop of keys) {
        const val = exps[prop];
        if (typeof val !== "function") throw new InternalError(`Not a function property: ${prop}`);

        exps[prop] = forkWithLogger(val, mod.filename);
    }
}
