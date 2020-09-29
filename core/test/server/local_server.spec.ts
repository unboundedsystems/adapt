/*
 * Copyright 2018-2019 Unbounded Systems, LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { mochaTmpdir } from "@adpt/testutils";
import * as fs from "fs-extra";
import * as path from "path";
import should from "should";

import {
    dbFilename,
    LocalServer,
} from "../../src/server/local_server";
import {
    adaptServer,
    AdaptServerType,
    mockServerTypes_,
    register,
} from "../../src/server/server";
import { initLocalServer } from "./common";

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
        return should(initLocalServer(false)).be.rejectedWith(RegExp(
            `Invalid Adapt Server URL 'file://${process.cwd()}': 'adapt_local.json' does not exist`));
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

    it("Should destroy history dirs", async () => {
        mockServerTypes_([]);
        register(LocalServer);
        const server = await initLocalServer(true);
        await server.historyStore("/deploy/1", true);
        await server.historyStore("/deploy/2", true);
        should((server as any).historyStores.size).equal(2);

        should(await fs.pathExists(path.join(process.cwd(), "deploy", "1"))).be.True();
        should(await fs.pathExists(path.join(process.cwd(), "deploy", "2"))).be.True();

        await server.destroy();
        should(await fs.pathExists(path.join(process.cwd(), "deploy", "1"))).be.False();
        should(await fs.pathExists(path.join(process.cwd(), "deploy", "2"))).be.False();
    });

    it("Should destroy remaining history dirs", async () => {
        mockServerTypes_([]);
        register(LocalServer);
        const server = await initLocalServer(true);
        const hist1 = await server.historyStore("/deploy/1", true);
        await server.historyStore("/deploy/2", true);
        should((server as any).historyStores.size).equal(2);

        should(await fs.pathExists(path.join(process.cwd(), "deploy", "1"))).be.True();
        should(await fs.pathExists(path.join(process.cwd(), "deploy", "2"))).be.True();

        await hist1.destroy();
        should((server as any).historyStores.size).equal(1);
        should(await fs.pathExists(path.join(process.cwd(), "deploy", "1"))).be.False();

        await server.destroy();
        should(await fs.pathExists(path.join(process.cwd(), "deploy", "2"))).be.False();
    });
});
