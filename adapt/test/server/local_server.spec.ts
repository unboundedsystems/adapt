import { mochaTmpdir } from "@usys/utils";
import * as fs from "fs-extra";
import * as should from "should";

import {
    dbFilename,
    LocalServer,
    LocalServerOptions
} from "../../src/server/local_server";
import {
    adaptServer,
    AdaptServer,
    AdaptServerType,
    mockServerTypes_,
    register,
} from "../../src/server/server";

async function initLocalServer(init: boolean): Promise<AdaptServer> {
    const opts: LocalServerOptions = { init };
    const server = await adaptServer("file://" + process.cwd(), opts);
    should(server instanceof LocalServer).be.True();
    return server;
}

describe("Server tests", () => {
    let origServerTypes: AdaptServerType[];
    mochaTmpdir.each("test-adapt-server");

    beforeEach(() => {
        origServerTypes = mockServerTypes_();
    });
    afterEach(() => {
        mockServerTypes_(origServerTypes);
    });

    it("Should init a file URL with default registrations", async () => {
        should(origServerTypes).have.length(1);
        const server = await initLocalServer(true);
        const someobject = { bar: 1 };
        await server.set("/foo", someobject);
        should(await server.get("/foo")).eql(someobject);
    });

    it("Should throw with no serverTypes registered", () => {
        mockServerTypes_([]);
        return should(adaptServer("file://" + process.cwd(), {}))
            .rejectedWith(/Adapt server url.*is not a supported url type/);
    });
});

describe("LocalServer tests", () => {
    let origServerTypes: AdaptServerType[];
    mochaTmpdir.each("test-adapt-localserver");

    beforeEach(() => {
        origServerTypes = mockServerTypes_();
    });
    afterEach(() => {
        mockServerTypes_(origServerTypes);
    });

    it("Should init a file URL when registered", async () => {
        mockServerTypes_([]);
        register(LocalServer);
        const server = await initLocalServer(true);
        const someobject = { bar: 1 };
        await server.set("/foo", someobject);
        should(await server.get("/foo")).eql(someobject);
    });

    it("Should throw if DB doesn't exist and init is false", () => {
        mockServerTypes_([]);
        register(LocalServer);
        return should(initLocalServer(false))
            .rejectedWith(/Adapt local server file .* does not exist/);
    });

    it("Should store data in JSON format", async () => {
        mockServerTypes_([]);
        register(LocalServer);
        const server = await initLocalServer(true);
        await server.set("/foo/bar", {baz: "qaz"});
        const contents = await fs.readJson(dbFilename);
        should(contents).eql({
            adaptLocalServerVersion: 0,
            foo: {
                bar: {
                    baz: "qaz"
                }
            }
        });
    });

    it("Should not throw on overwrite existing", async () => {
        mockServerTypes_([]);
        register(LocalServer);
        const server = await initLocalServer(true);
        await server.set("/foo/bar", 1);
        await server.set("/foo/bar", 2);
        const val = await server.get("/foo/bar");
        should(val).equal(2);
    });

    it("Should throw on mustCreate with existing", async () => {
        mockServerTypes_([]);
        register(LocalServer);
        const server = await initLocalServer(true);
        await server.set("/foo/bar", 1, { mustCreate: true });
        return should(server.set("/foo/bar", 2, { mustCreate: true }))
            .be.rejectedWith(/path '\/foo\/bar' already exists/);
    });
});
