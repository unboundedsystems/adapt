import should from "should";
import {
    LocalServer,
    LocalServerOptions
} from "../../src/server/local_server";
import { adaptServer, AdaptServer } from "../../src/server/server";

export async function initLocalServer(init: boolean): Promise<AdaptServer> {
    const opts: LocalServerOptions = { init };
    const server = await adaptServer("file://" + process.cwd(), opts);
    should(server instanceof LocalServer).be.True();
    return server;
}
