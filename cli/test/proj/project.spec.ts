import { expect } from "chai";
import * as fs from "fs-extra";
import * as path from "path";
import * as tmpdir from "../testlib/mocha-tmpdir";

import * as proj from "../../src/proj/project";

const basicPackageJson = {
    name: "test",
    version: "1.0.0",
    description: "Adapt project",
    main: "dist/index.js",
    scripts: {},
    author: "",
    license: "UNLICENSED",
    dependencies: {
        typescript: "^2.9.2"
    },
};

describe("Project basic tests", () => {
    tmpdir.each("adapt-cli-proj");

    it("Should open a local directory", async function() {
        const projDir = tmpdir.getTmpdir(this);
        await fs.writeJson(path.join(projDir, "package.json"), basicPackageJson,
                           {spaces: 2});

        const p = await proj.load(projDir);
        expect(p).to.be.an("object");
        expect(p.manifest.name).equal("test");
        expect(p.manifest.version).equal("1.0.0");
        expect(p.manifest._resolved).equal(projDir);
        expect(p.manifest.dependencies.typescript).equal("^2.9.2");
    });

    it("Should get a registry package", async () => {
        const p = await proj.load("decamelize@2.0.0");
        expect(p).to.be.an("object");
        expect(p.manifest.name).equal("decamelize");
        expect(p.manifest.version).equal("2.0.0");
        expect(p.manifest._resolved).equal("https://registry.npmjs.org/decamelize/-/decamelize-2.0.0.tgz");
        expect(p.manifest.dependencies.xregexp).equal("4.0.0");
    });
});
