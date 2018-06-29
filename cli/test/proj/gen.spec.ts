import { expect } from "chai";
import * as fs from "fs-extra";
import { cloneDeep } from "lodash";
import * as path from "path";
import * as tmpdir from "../testlib/mocha-tmpdir";

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
    loglevel: "error",
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
    tmpdir.each("adapt-cli-test-gen");

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
        const match = _getGen(proj, [genBasic]);
        const mi = match.matchInfo;
        expect(match.gen).equals(genBasic);
        expect(mi.matches).equals(true);
        expect(mi.ok.length).equals(2);
    });
});
