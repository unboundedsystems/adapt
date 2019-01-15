import decamelize from "decamelize";
import execa from "execa";

export type LogLevel = "normal" | "silent" | "verbose";

export interface CommonOptions {
    cwd?: string;
    loglevel?: LogLevel;
    modulesFolder?: string;
    mutex?: string;
    noProgress?: boolean;
    registry?: string;
    userconfig?: string;
}

export interface InternalOptions extends CommonOptions {
    pipeOutput?: boolean;
    boolNoArgOptions?: string[];
}

const noArgOptions = [
    "noProgress",
];

interface AnyOptions {
    [key: string]: any;
}

export const commonDefaults = {
    loglevel: "normal",
    pipeOutput: false,
    noProgress: true,
};

export interface Output {
    stdout: string;
    stderr: string;
}

export async function run(action: string, options: InternalOptions & AnyOptions, args?: string[]): Promise<Output> {
    // tslint:disable-next-line:prefer-const
    let { boolNoArgOptions = [], loglevel, pipeOutput, ...opts } = { ...commonDefaults, ...options };

    opts.mutex = getMutex();

    boolNoArgOptions.push(...noArgOptions);
    const finalOpts = optionsBoolToUndef(opts, boolNoArgOptions);

    const finalArgs = [action];
    if (loglevel === "silent") finalArgs.push("--silent");
    if (loglevel === "verbose") finalArgs.push("--verbose");

    for (const opt of Object.keys(finalOpts)) {
        const flag = "--" + decamelize(opt, "-");
        finalArgs.push(flag);
        const val = (finalOpts as any)[opt];
        if (val !== undefined) finalArgs.push(val.toString());
    }
    if (args) finalArgs.push(...args);

    try {
        const prom = execa("yarn", finalArgs, { stripEof: false });
        if (pipeOutput) {
            prom.stdout.pipe(process.stdout);
            prom.stderr.pipe(process.stdout);
        }
        return prom;

    } catch (err) {
        err.message = `yarn ${action} failed: ${err.message}`;
        throw err;
    }
}

function optionsBoolToUndef(options: AnyOptions, keys: string[]): AnyOptions {
    const ret = { ...options };
    for (const k of keys) {
        if (ret[k]) ret[k] = undefined;
        else delete ret[k];
    }
    return ret;
}

function getMutex(): string {
    return process.env.YARN_MUTEX || "file";
}
