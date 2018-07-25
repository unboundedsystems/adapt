import * as localRegistry from "./local-registry";

type FixtureFunc = (callback: (done: MochaDone) => PromiseLike<any> | void) => void;

function fixture(beforeFn: FixtureFunc, afterFn: FixtureFunc,
                 config: localRegistry.Config, configPath: string) {
    let server: localRegistry.Server | undefined;

    beforeFn(async function startLocalRegistry() {
        server = await localRegistry.start(config, configPath);
    });

    afterFn(async function stopLocalRegistry() {
        if (server) await server.stop();
    });
}

export function all(config: localRegistry.Config, configPath: string) {
    fixture(before, after, config, configPath);
}

export function each(config: localRegistry.Config, configPath: string) {
    fixture(beforeEach, afterEach, config, configPath);
}
