import { spawn } from "child_process";
import * as decamelize from "decamelize";

export type LogLevel = "silent" | "error" | "warn" | "notice" | "http" |
    "timing" | "info" | "verbose" | "silly";

export interface CommonOptions {
    cwd?: string;
    loglevel?: LogLevel;
    progress?: boolean;
    registry?: string;
}

export const commonDefaults: CommonOptions = {
    loglevel: "warn",
    progress: true,
};

export function run(action: string, options: any, args?: string[]): Promise<void> {
    // tslint:disable-next-line:prefer-const
    let { cwd = null, ...finalOpts } = { ...commonDefaults, ...options };
    cwd = cwd || process.cwd();

    let finalArgs = [action];
    for (const opt of Object.keys(finalOpts)) {
        const flag = "--" + decamelize(opt, "-");
        const val = (finalOpts as any)[opt];
        finalArgs = finalArgs.concat([flag, val.toString()]);
    }
    if (args) finalArgs = finalArgs.concat(args);

    return new Promise((resolve, reject) => {
        try {
            const child = spawn("npm", finalArgs, { cwd, stdio: "inherit" });
            child.on("error", (err) => reject(err));
            child.on("exit", (code, signal) => {
                if (signal != null) {
                    reject(new Error(`npm install exited on signal ${signal}`));
                } else if (code !== 0) {
                    reject(new Error(`npm install failed (exit code ${code})`));
                } else {
                    resolve();
                }
            });

        } catch (err) {
            reject(err);
        }
    });
}
