/*
 * Copyright 2020 Unbounded Systems, LLC
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

import { S_IRWXG, S_IRWXO, S_IRWXU } from "constants";
import { ensureDir, readFile, stat, writeFile } from "fs-extra";
// tslint:disable-next-line:no-var-requires
const mockedEnv = require("mocked-env");
import nock from "nock";
import path from "path";
import should from "should";

import { mkdtmp } from "../src/mkdtmp";
import { fetchToCache } from "../src/tool-cache";

async function checkPerm(file: string, expected: number) {
    const actual = await stat(file);
    // tslint:disable-next-line: no-bitwise
    should(actual.mode & (S_IRWXG | S_IRWXO | S_IRWXU)).equal(expected,
        `Incorrect mode on ${file}`);
}

describe("tool-cache", () => {
    let removeTmp: () => Promise<void>;
    let tmpdir: string;
    let envRestore: any;

    before(async () => {
        const pTmpdir = mkdtmp("adapt-test-tool-cache");
        removeTmp = pTmpdir.remove;
        tmpdir = await pTmpdir;
        envRestore = mockedEnv({
            XDG_CACHE_HOME: tmpdir,
        });
    });
    after(async () => {
        envRestore();
        await removeTmp();
        nock.restore();
    });
    afterEach(() => {
        nock.cleanAll();
    });

    const toolsDir = () => path.join(tmpdir, "adapt", "tools");

    it("Should fetch file with defaults", async () => {
        let requests = 0;
        const url = "https://adaptjs.org/index.html";
        nock("https://adaptjs.org")
            .get("/index.html")
            .reply(200, () => {
                requests++;
                return "index.html contents";
            });

        const { dir, file } = await fetchToCache({
            name: "index",
            url,
        });

        should(requests).equal(1);
        should(dir).equal(path.join(toolsDir(), "index", "49aaf"));
        should(file).equal(path.join(toolsDir(), "index", "49aaf", "index.html"));
        const contents = await readFile(file);
        should(contents.toString()).equal("index.html contents");
        await checkPerm(toolsDir(), 0o700);
        await checkPerm(path.join(toolsDir(), "index"), 0o700);
        await checkPerm(path.join(toolsDir(), "index", "49aaf", "index.html"), 0o500);

        const second = await fetchToCache({
            name: "index",
            url,
        });
        should(requests).equal(1);
        should(second.dir).equal(dir);
        should(second.file).equal(file);
    });

    it("Should not fetch file in cache", async () => {
        const dir = path.join(toolsDir(), "incache", "9d3f6");
        const file = path.join(dir, "incache");
        const url = "https://adaptjs.org/incache";

        await ensureDir(dir);
        await writeFile(file, "incache contents");

        const entry = await fetchToCache({
            name: "incache",
            url,
        });
        should(entry.dir).equal(dir);
        should(entry.file).equal(file);
    });

    it("Should fail with error", async () => {
        const url = "https://adaptjs.org/notfound";
        nock("https://adaptjs.org")
            .get("/notfound")
            .reply(404, "Nope");

        await should(fetchToCache({
            name: "notfound",
            url,
        })).be.rejectedWith("Could not get notfound from https://adaptjs.org/notfound: Not Found");

        // Multiple requestors for this url should see the same error
        await should(fetchToCache({
            name: "notfound",
            url,
        })).be.rejectedWith("Could not get notfound from https://adaptjs.org/notfound: Not Found");
    });

    it("Should require filename", async () => {
        const url = "https://adaptjs.org";

        await should(fetchToCache({
            name: "require",
            url,
        })).be.rejectedWith("Cannot determine a local file name to use for fetching require. Use the 'file' option.");
    });

    it("Should ignore query in filename, use version in path, and set mode", async () => {
        const url = "https://adaptjs.org/thefile?q=foo/bar";
        nock("https://adaptjs.org")
            .get("/thefile?q=foo/bar")
            .reply(200, () => {
                return "thefile contents";
            });

        const { dir, file } = await fetchToCache({
            name: "ignore",
            mode: 0o700,
            version: "1.2.3",
            url,
        });

        should(dir).equal(path.join(toolsDir(), "ignore", "1.2.3-629f7"));
        should(file).equal(path.join(toolsDir(), "ignore", "1.2.3-629f7", "thefile"));
        const contents = await readFile(file);
        should(contents.toString()).equal("thefile contents");
        await checkPerm(path.join(toolsDir(), "ignore"), 0o700);
        await checkPerm(path.join(toolsDir(), "ignore", "1.2.3-629f7", "thefile"), 0o700);
    });
});
