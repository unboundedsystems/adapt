import { expect } from "chai";
import * as fs from "fs-extra";
import * as path from "path";
import { sourceDir } from "../testlib";
import * as tmpdir from "../testlib/mocha-tmpdir";

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
        typescript: "^2.9.2"
    },
};

describe("Project basic tests", () => {
    tmpdir.each("adapt-cli-test-proj");

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

    it("Should open a local relative directory", async function() {
        const projDir = tmpdir.getTmpdir(this);
        await fs.writeJson(path.join(projDir, "package.json"), basicPackageJson,
                           {spaces: 2});

        // mocha-tmpdir changes cwd to the temp dir, so just load "."
        const p = await proj.load(".");
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

    it("Should open a local tgz package", async () => {
        const tgzFile = path.join(mySourceDir, "test-tar.tgz");
        const p = await proj.load(tgzFile);
        expect(p).to.be.an("object");
        expect(p.manifest.name).equal("test-tar");
        expect(p.manifest.version).equal("1.0.1");
        expect(p.manifest._resolved).equal(tgzFile);
        expect(p.manifest.dependencies.typescript).equal("^2.9.2");
    });

    it("Should get a github package", async () => {
        const p = await proj.load("sindresorhus/decamelize#v1.2.0");
        expect(p).to.be.an("object");
        expect(p.manifest.name).equal("decamelize");
        expect(p.manifest.version).equal("1.2.0");
        expect(p.manifest._resolved).equal("github:sindresorhus/decamelize#95980ab6fb44c40eaca7792bdf93aff7c210c805");
        expect(p.manifest.devDependencies.ava).equal("*");
    });

    it("Should fail directory without package.json", async () => {
        // "." is the empty tmpdir
        return expect(proj.load(".")).to.be.rejectedWith("ENOENT");
    });

    it("Should fail with bad package name", async () => {
        return expect(proj.load("XXXBADPACKAGE")).to.be.rejectedWith("404 Not Found: XXXBADPACKAGE");
    });
});
