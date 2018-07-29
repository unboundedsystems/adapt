import { mochaTmpdir } from "@usys/utils";
import * as fs from "fs-extra";
import * as path from "path";
import * as should from "should";

import { LocalServer, LocalServerOptions } from "../../src/server/local_server";
import {
    _mockServerTypes,
    adaptServer,
    AdaptServer,
    AdaptServerType,
    register,
} from "../../src/server/server";

async function initLocalServer(dbFile: string, init: boolean): Promise<AdaptServer> {
    dbFile = path.join(process.cwd(), dbFile);
    const opts: LocalServerOptions = { init };
    const server = await adaptServer("file://" + dbFile, opts);
    should(server instanceof LocalServer).be.True();
    return server;
}

describe("Server tests", () => {
    let origServerTypes: AdaptServerType[];
    mochaTmpdir.each("test-adapt-server");

    beforeEach(() => {
        origServerTypes = _mockServerTypes();
    });
    afterEach(() => {
        _mockServerTypes(origServerTypes);
    });

    it("Should init a file URL with default registrations", async () => {
        should(origServerTypes).have.length(1);
        const server = await initLocalServer("db.json", true);
        const someobject = { bar: 1 };
        await server.set("/foo", someobject);
        should(await server.get("/foo")).eql(someobject);
    });

    it("Should throw with no serverTypes registered", () => {
        _mockServerTypes([]);
        const dbFile = path.join(process.cwd(), "db.json");
        return should(adaptServer("file://" + dbFile, {}))
            .rejectedWith(/Adapt server url.*is not a supported url type/);
    });
});

describe("LocalServer tests", () => {
    let origServerTypes: AdaptServerType[];
    mochaTmpdir.each("test-adapt-localserver");

    beforeEach(() => {
        origServerTypes = _mockServerTypes();
    });
    afterEach(() => {
        _mockServerTypes(origServerTypes);
    });

    it("Should init a file URL when registered", async () => {
        _mockServerTypes([]);
        register(LocalServer);
        const server = await initLocalServer("db.json", true);
        const someobject = { bar: 1 };
        await server.set("/foo", someobject);
        should(await server.get("/foo")).eql(someobject);
    });

    it("Should throw if DB doesn't exist and init is false", () => {
        _mockServerTypes([]);
        register(LocalServer);
        return should(initLocalServer("db.json", false))
            .rejectedWith(/Adapt local server file .* does not exist/);
    });

    it("Should store data in JSON format", async () => {
        _mockServerTypes([]);
        register(LocalServer);
        const server = await initLocalServer("db.json", true);
        await server.set("/foo/bar", {baz: "qaz"});
        const contents = await fs.readJson("db.json");
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
        _mockServerTypes([]);
        register(LocalServer);
        const server = await initLocalServer("db.json", true);
        await server.set("/foo/bar", 1);
        await server.set("/foo/bar", 2);
        const val = await server.get("/foo/bar");
        should(val).equal(2);
    });

    it("Should throw on mustCreate with existing", async () => {
        _mockServerTypes([]);
        register(LocalServer);
        const server = await initLocalServer("db.json", true);
        await server.set("/foo/bar", 1, { mustCreate: true });
        return should(server.set("/foo/bar", 2, { mustCreate: true }))
            .be.rejectedWith(/path '\/foo\/bar' already exists/);
    });
});
