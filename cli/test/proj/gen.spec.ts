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
import { expect } from "chai";
import * as fs from "fs-extra";
import { cloneDeep } from "lodash";
import * as path from "path";

import {
    _getGen,
    Gen,
    matchDeps,
    validateGenList,
} from "../../src/proj/gen";
import {
    load,
    Project,
    ProjectOptions,
} from "../../src/proj/project";

const basicPackageJson = {
    name: "test",
    version: "1.0.0",
    description: "Adapt project",
    main: "dist/index.js",
    scripts: {},
    author: "",
    license: "UNLICENSED",
    dependencies: {
        "typescript": "^2.8.3",
        "@types/node": "^8.10"
    },
};

const genBasic: Gen = {
    name: "genBasic",
    match: matchDeps,
    dependencies: {
        "@types/node": { allowed: ">=8", preferred: "^8.10.20" },
        "typescript": { allowed: ">2.8", preferred: "^2.9" },
    }
};
const genEmpty: Gen = {
    name: "genEmpty",
    match: matchDeps,
    dependencies: { }
};

const projOpts: ProjectOptions = {
    progress: false,
    loglevel: "normal",
};

// NOTE: Assumes use with mocha-tmpdir, which changes cwd to a new, empty
// temp directory.
async function loadProject(pkgJson: any): Promise<Project> {
    const projDir = process.cwd();
    await fs.writeJson(path.join(projDir, "package.json"), pkgJson,
                       {spaces: 2});

    return load(projDir, projOpts);
}

describe("Gen basic tests", () => {
    mochaTmpdir.each("adapt-cli-test-gen");

    it("Should accept valid Gen list", () => {
        validateGenList([ genBasic, genEmpty ]);
    });

    it("Should not accept empty Gen list", () => {
        expect(() => validateGenList([])).to.throw("cannot be empty");
    });

    it("Should throw on bad range", () => {
        const bad = cloneDeep(genBasic);
        bad.dependencies.typescript.allowed = "foo";

        expect(() => validateGenList([bad])).to.throw(
            "Invalid semver allowed range string 'foo' for package 'typescript' in 'genBasic'");
    });

    it("Should throw on bad version", () => {
        const bad = cloneDeep(genBasic);
        bad.dependencies.typescript.preferred = "foo";

        expect(() => validateGenList([bad])).to.throw(
            "Invalid semver preferred range string 'foo' for package 'typescript' in 'genBasic'");
    });

    it("Should match genBasic", async () => {
        const proj = await loadProject(basicPackageJson);
        await proj.installModules();
        const gmatch = _getGen(proj, [genBasic]);
        const mi = gmatch.matchInfo;
        expect(gmatch.gen).equals(genBasic);
        expect(mi.matches).equals(true);
        expect(mi.ok.length).equals(2);
    });

    it("Should list missing packages", async () => {
        const bad: any = cloneDeep(basicPackageJson);
        bad.dependencies = {};
        const proj = await loadProject(bad);
        await proj.installModules();
        const gmatch = _getGen(proj, [genBasic]);

        expect(gmatch.gen).equals(genBasic);
        const mi = gmatch.matchInfo;
        expect(mi.matches).equals(false);
        expect(mi.ok.length).equals(0);
        expect(mi.required).eql([
            {
                name: "@types/node",
                message: "Package '@types/node' is not installed",
            },
            {
                name: "typescript",
                message: "Package 'typescript' is not installed",
            }
        ]);
    });

    it("Should list packages with incorrect version", async () => {
        const bad: any = cloneDeep(basicPackageJson);
        bad.dependencies = {
            "typescript": "2.9.2",
            "@types/node": "^6",
        };
        const newgen = cloneDeep(genBasic);
        newgen.dependencies.typescript.allowed = "2.8.x";
        const proj = await loadProject(bad);
        await proj.installModules();
        const gmatch = _getGen(proj, [newgen]);

        expect(gmatch.gen).equals(newgen);
        const mi = gmatch.matchInfo;
        expect(mi.matches).equals(false);
        expect(mi.ok.length).equals(0);
        expect(mi.required[0].name).equals("@types/node");
        expect(mi.required[0].message).matches(
            /Package '@types\/node' version '6.*?' does not meet required version range '>=8'/);
        expect(mi.required[1].name).equals("typescript");
        expect(mi.required[1].message).matches(
            /Package 'typescript' version '2.9.2' does not meet required version range '2.8.x'/);
    });
});
