/*
 * Copyright 2019 Unbounded Systems, LLC
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

import fs from "fs-extra";
import path from "path";
import should from "should";
import { mkdtmp, yarn } from "../src";

import { createPackageRegistry, LazyPackageRegistry } from "../src/package_registry";

const basicPackageJson = {
    name: "testme",
    version: "1.0.0",
    description: "Some test project",
    scripts: {},
    author: "",
    license: "UNLICENSED",
    dependencies: {
        "@types/node": "10.5.2",
        "source-map-support": "0.5.6",
        "body-parser": "1.18.3",
        "debug": "4.1.0",
    },
};

describe("Package registry", () => {
    let prevDir: string | undefined;
    let tmpDir: string | undefined;

    before(async function () {
        this.timeout(60 * 1000);
        prevDir = process.cwd();
        tmpDir = await mkdtmp("adapt-test-pkgreg");
        process.chdir(tmpDir);

        await fs.writeJSON("package.json", basicPackageJson);
        await yarn.install({preferOffline: true});
    });

    after(async () => {
        if (prevDir) process.chdir(prevDir);
        if (tmpDir) await fs.remove(tmpDir);
    });

    it("Should create list of installed packages", async () => {
        const reg = new LazyPackageRegistry(".");
        const absPath = path.resolve(".");

        const list = await reg.scanPackages();
        should(list).not.be.Null();

        const pathList = list.get("debug");
        if (pathList === undefined) throw should(pathList).not.be.Undefined();
        should(pathList).be.an.Array();
        should(pathList).have.length(2);
        should(pathList).containDeep([
            path.normalize(`${absPath}/node_modules/body-parser/node_modules/debug`),
            path.normalize(`${absPath}/node_modules/debug`),
        ]);
    });

    it("Should look up installed packages", async () => {
        const reg = createPackageRegistry(".");
        const absPath = path.resolve(".");

        let pkgPath = await reg.findPath("debug", "4.1.0");
        should(pkgPath).equal(path.normalize(`${absPath}/node_modules/debug`));

        pkgPath = await reg.findPath("debug", "2.6.9");
        should(pkgPath).equal(path.normalize(`${absPath}/node_modules/body-parser/node_modules/debug`));

        pkgPath = await reg.findPath("debug", "3.2.1");
        should(pkgPath).be.Undefined();

        pkgPath = await reg.findPath("testme", "1.0.0");
        should(pkgPath).equal(absPath);
    });
});
