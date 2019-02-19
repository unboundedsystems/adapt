import * as Config from "@oclif/config";
import * as stdMock from "stdout-stderr";
import { pkgRootDir } from "./paths";

export interface Env {
    [k: string]: string | undefined;
}

const savedEnvs: (typeof process.env)[] = [];

async function withEnv<Ret>(env: Env, func: () => Ret | Promise<Ret>): Promise<Ret> {
    try {
        savedEnvs.push(process.env);
        process.env = { ...process.env, ...env };
        return await func();

    } finally {
        const oldEnv = savedEnvs.pop();
        if (oldEnv) process.env = oldEnv;
    }
}

async function withStdMock(func: () => void) {
    try {
        stdMock.stdout.start();
        stdMock.stderr.start();
        await func();

    } finally {
        stdMock.stdout.stop();
        stdMock.stderr.stop();
    }
    return {
        stdout: stdMock.stdout.output,
        stderr: stdMock.stderr.output,
    };
}

export async function runCommand(args: string[] | string, env: Env = {}) {
    const config = await Config.load({ root: pkgRootDir });
    if (typeof args === "string") args = [args];
    const [id, ...extra] = args;

    return withEnv(env, async () => {
        return withStdMock(async () => {
            await config.runHook("init", { id, argv: extra });
            await config.runCommand(id, extra);
        });
    });
}
