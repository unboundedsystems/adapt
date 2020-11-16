/*
 * Copyright 2018-2020 Unbounded Systems, LLC
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

import { mochaTmpdir, repoVersions } from "@adpt/testutils";
import { expect } from "chai";
import * as fs from "fs-extra";
import * as path from "path";
import { sourceDir } from "../common/paths";
import { cliLocalRegistry } from "../common/start-local-registry";

import * as proj from "../../src/proj/project";

const mySourceDir = sourceDir(__dirname);

const basicPackageJson = {
    name: "test",
    version: "1.0.0",
    description: "Adapt project",
    main: "dist/index.js",
    scripts: {},
    author: "",
    license: "UNLICENSED",
    dependencies: {
        typescript: "^3.0.3"
    },
};

const projOpts: proj.ProjectOptions = {
    progress: false,
    loglevel: "normal",
};

describe("Project basic tests", function () {
    this.slow(3 * 1000);
    this.timeout(10 * 1000);
    mochaTmpdir.each("adapt-cli-test-proj");

    it("Should open a local directory", async () => {
        const projDir = process.cwd();
        await fs.writeJson(path.join(projDir, "package.json"), basicPackageJson,
                           {spaces: 2});

        const p = await proj.load(projDir, projOpts);
        expect(p).to.be.an("object");
        expect(p.manifest.name).equal("test");
        expect(p.manifest.version).equal("1.0.0");
        expect(p.manifest._resolved).equal(projDir);
        expect(p.manifest.dependencies.typescript).equal("^3.0.3");
    });

    it("Should open a local relative directory", async () => {
        const projDir = process.cwd();
        await fs.writeJson(path.join(projDir, "package.json"), basicPackageJson,
                           {spaces: 2});

        // mocha-tmpdir changes cwd to the temp dir, so just load "."
        const p = await proj.load(".", projOpts);
        expect(p).to.be.an("object");
        expect(p.manifest.name).equal("test");
        expect(p.manifest.version).equal("1.0.0");
        expect(p.manifest._resolved).equal(projDir);
        expect(p.manifest.dependencies.typescript).equal("^3.0.3");
    });

    it("Should get a registry package", async function () {
        this.slow(9 * 1000);
        this.timeout(20 * 1000);
        const p = await proj.load("decamelize@3.2.0", projOpts);
        expect(p).to.be.an("object");
        expect(p.manifest.name).equal("decamelize");
        expect(p.manifest.version).equal("3.2.0");
        expect(p.manifest._resolved).equal("https://registry.npmjs.org/decamelize/-/decamelize-3.2.0.tgz");
        expect(p.manifest.dependencies.xregexp).equal("^4.2.4");

        await p.installModules();
        expect(p.getLockedVersion("xregexp")).equal("4.4.0");
        expect(p.getLockedVersion("badpkg")).equal(null);
    });

    it("Should open a local tgz package", async () => {
        const tgzFile = path.join(mySourceDir, "test-tar.tgz");
        const p = await proj.load(tgzFile, projOpts);
        expect(p).to.be.an("object");
        expect(p.manifest.name).equal("test-tar");
        expect(p.manifest.version).equal("1.0.1");
        expect(p.manifest._resolved).equal(tgzFile);
        expect(p.manifest.dependencies.typescript).equal("^3.0.0");
    });

    it("Should get a github package", async function () {
        this.slow(10 * 1000);
        this.timeout(40 * 1000);
        const p = await proj.load("substack/json-stable-stringify#1.0.1", projOpts);
        expect(p).to.be.an("object");
        expect(p.manifest.name).equal("json-stable-stringify");
        expect(p.manifest.version).equal("1.0.1");
        expect(p.manifest._resolved)
            .equal("github:substack/json-stable-stringify#4a3ac9cc006a91e64901f8ebe78d23bf9fc9fbd0");
        expect(p.manifest.dependencies.jsonify).equal("~0.0.0");
        expect(p.manifest.devDependencies.tape).equal("~1.0.4");

        await p.installModules();
        expect(p.getLockedVersion("jsonify")).equal("0.0.0");
        expect(p.getLockedVersion("badpkg")).equal(null);
    });

    it("Should fail directory without package.json", async () => {
        // "." is the empty tmpdir
        return expect(proj.load(".", projOpts)).to.be.rejectedWith("ENOENT");
    });

    it("Should fail with bad package name", async () => {
        return expect(proj.load("XXXBADPACKAGE", projOpts)).to.be.rejectedWith(/404 Not Found.*XXXBADPACKAGE/);
    });

    it("Should load from alternate registry", async function () {
        this.slow(20 * 1000);
        this.timeout(50 * 1000);
        const opts = { ...cliLocalRegistry.yarnProxyOpts, ...projOpts };
        const p = await proj.load("@adpt/dom-parser@unit-tests", opts);
        expect(p).to.be.an("object");
        expect(p.manifest.name).equal("@adpt/dom-parser");
        expect(p.manifest.version).equal(repoVersions["dom-parser"]);
        expect(p.manifest.dependencies.tslib).equal("2.0.3");
        await p.installModules();
        expect(p.getLockedVersion("tslib")).equals("2.0.3");
    });
});
