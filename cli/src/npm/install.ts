import { spawn } from "child_process";
import * as decamelize from "decamelize";

export type LogLevel = "silent" | "error" | "warn" | "notice" | "http" |
    "timing" | "info" | "verbose" | "silly";

export interface InstallOptions {
    dir?: string;
    packages?: string[];
    progress?: boolean;
    packageLockOnly?: boolean;
    loglevel?: LogLevel;
}

const defaultOptions: InstallOptions = {
    progress: true,
};

export function install(options?: InstallOptions): Promise<void> {
    const { dir, packages, ...finalOpts } = { ...defaultOptions, ...options };
    const cwd = dir || process.cwd();

    let args = ["install"];
    for (const opt of Object.keys(finalOpts)) {
        const flag = "--" + decamelize(opt, "-");
        const val = (finalOpts as any)[opt];
        args = args.concat([flag, val.toString()]);
    }
    if (packages) args = args.concat(packages);

    return new Promise((resolve, reject) => {
        try {
            const child = spawn("npm", args, { cwd, stdio: "inherit" });
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
