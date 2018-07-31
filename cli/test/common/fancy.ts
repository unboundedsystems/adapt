import { command, expect, test as oclifTest } from "@oclif/test";
// tslint:disable-next-line:no-submodule-imports
import { loadConfig } from "@oclif/test/lib/load_config";
// tslint:disable-next-line:no-submodule-imports
import fancyEnv from "fancy-test/lib/env";
// tslint:disable-next-line:no-submodule-imports
import { EnvOptions } from "fancy-test/lib/types";

interface Env {
    [key: string]: string | null | undefined;
}
type DelayedEnvFunc = () => Env;

function delayedenv(getEnv?: DelayedEnvFunc, opts?: EnvOptions) {
    let envCtx: any;
    return {
        run() {
            const newEnv = getEnv && getEnv();
            envCtx = fancyEnv(newEnv, opts);
            envCtx.run();
        },
        finally() {
            envCtx.finally();
        }
    };
}

type DelayedCmdFunc = () => string[] | string | undefined;

function delayedcommand(getCmd?: DelayedCmdFunc, opts: loadConfig.Options = {}) {
    return {
        run(ctx: any) {
            if (getCmd == null) throw new Error(`delayedcommand must have at least one arg`);
            return command(getCmd(), opts).run(ctx);
        }
    };
}

export const clitest =
    oclifTest
    .register("delayedenv", delayedenv)
    .register("delayedcommand", delayedcommand);

export {
    EnvOptions,
    expect,
};
