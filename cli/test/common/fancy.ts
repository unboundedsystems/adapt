import { command, expect, test as oclifTest } from "@oclif/test";
// tslint:disable-next-line:no-submodule-imports
import { loadConfig } from "@oclif/test/lib/load-config";
// tslint:disable-next-line:no-submodule-imports
import fancyEnv from "fancy-test/lib/env";
// tslint:disable-next-line:no-submodule-imports
import { EnvOptions } from "fancy-test/lib/types";

export interface Env {
    [key: string]: string | null | undefined;
}
export type DelayedEnvFunc = () => Env;

function delayedenv(getEnv?: DelayedEnvFunc, opts?: EnvOptions) {
    let envCtx: any;
    return {
        run() {
            if (getEnv == null) {
                throw new Error(`Must supply a function as the first argument to delayedenv`);
            }
            envCtx = fancyEnv(getEnv(), opts);
            envCtx.run();
        },
        finally() {
            envCtx.finally();
        }
    };
}

type DelayedCmdFunc = () => string[] | string;

function delayedcommand(getCmd?: DelayedCmdFunc, opts: loadConfig.Options = {}) {
    return {
        run(ctx: any) {
            if (getCmd == null) throw new Error(`delayedcommand must have at least one arg`);
            return command(getCmd(), opts).run(ctx);
        }
    };
}

function onerror(fn?: (ctx: any) => void) {
    if (fn == null) throw new Error(`onerror requires one argument`);
    return {
        finally(ctx: { error: object }) {
            if (ctx.error != null) fn(ctx);
        }
    };
}

export const clitest =
    oclifTest
    .register("delayedenv", delayedenv)
    .register("delayedcommand", delayedcommand)
    .register("onerror", onerror);

export {
    EnvOptions,
    expect,
};
