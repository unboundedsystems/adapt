import * as verdaccio from "./verdaccio";

type FixtureFunc = (callback: (done: MochaDone) => PromiseLike<any> | void) => void;

function fixture(beforeFn: FixtureFunc, afterFn: FixtureFunc,
                 config: verdaccio.Config, configPath: string) {
    let server: verdaccio.VerdaccioServer | undefined;

    beforeFn(async function startVerdaccio() {
        server = await verdaccio.start(config, configPath);
    });

    afterFn(async function stopVerdaccio() {
        if (server) await server.stop();
    });
}

export function all(config: verdaccio.Config, configPath: string) {
    fixture(before, after, config, configPath);
}

export function each(config: verdaccio.Config, configPath: string) {
    fixture(beforeEach, afterEach, config, configPath);
}
