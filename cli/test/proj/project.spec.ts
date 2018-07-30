import { localRegistryDefaults, mochaTmpdir } from "@usys/utils";
import { expect } from "chai";
import * as fs from "fs-extra";
import * as path from "path";
import { sourceDir } from "../common/paths";

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

const projOpts: proj.ProjectOptions = {
    progress: false,
    loglevel: "error",
};

describe("Project basic tests", function() {
    this.timeout(20000);
    mochaTmpdir.each("adapt-cli-test-proj");

    it("Should open a local directory", async function() {
        const projDir = mochaTmpdir.getTmpdir(this);
        await fs.writeJson(path.join(projDir, "package.json"), basicPackageJson,
                           {spaces: 2});

        const p = await proj.load(projDir, projOpts);
        expect(p).to.be.an("object");
        expect(p.manifest.name).equal("test");
        expect(p.manifest.version).equal("1.0.0");
        expect(p.manifest._resolved).equal(projDir);
        expect(p.manifest.dependencies.typescript).equal("^2.9.2");
    });

    it("Should open a local relative directory", async function() {
        const projDir = mochaTmpdir.getTmpdir(this);
        await fs.writeJson(path.join(projDir, "package.json"), basicPackageJson,
                           {spaces: 2});

        // mocha-tmpdir changes cwd to the temp dir, so just load "."
        const p = await proj.load(".", projOpts);
        expect(p).to.be.an("object");
        expect(p.manifest.name).equal("test");
        expect(p.manifest.version).equal("1.0.0");
        expect(p.manifest._resolved).equal(projDir);
        expect(p.manifest.dependencies.typescript).equal("^2.9.2");
    });

    it("Should get a registry package", async () => {
        const p = await proj.load("decamelize@2.0.0", projOpts);
        expect(p).to.be.an("object");
        expect(p.manifest.name).equal("decamelize");
        expect(p.manifest.version).equal("2.0.0");
        expect(p.manifest._resolved).equal("https://registry.npmjs.org/decamelize/-/decamelize-2.0.0.tgz");
        expect(p.manifest.dependencies.xregexp).equal("4.0.0");

        const lock = p.packageLock;
        expect(lock.name).equal("decamelize");
        expect(lock.version).equal("2.0.0");

        expect(p.getLockedVersion("xregexp")).equal("4.0.0");
        expect(p.getLockedVersion("ava")).equal("0.25.0");
        expect(p.getLockedVersion("badpkg")).equal(null);
    });

    it("Should open a local tgz package", async () => {
        const tgzFile = path.join(mySourceDir, "test-tar.tgz");
        const p = await proj.load(tgzFile, projOpts);
        expect(p).to.be.an("object");
        expect(p.manifest.name).equal("test-tar");
        expect(p.manifest.version).equal("1.0.1");
        expect(p.manifest._resolved).equal(tgzFile);
        expect(p.manifest.dependencies.typescript).equal("^2.9.2");
    });

    it("Should get a github package", async function() {
        this.timeout(40000);
        const p = await proj.load("sindresorhus/decamelize#v1.2.0", projOpts);
        expect(p).to.be.an("object");
        expect(p.manifest.name).equal("decamelize");
        expect(p.manifest.version).equal("1.2.0");
        expect(p.manifest._resolved).equal("github:sindresorhus/decamelize#95980ab6fb44c40eaca7792bdf93aff7c210c805");
        expect(p.manifest.devDependencies.ava).equal("*");

        const lock = p.packageLock;
        expect(lock.name).equal("decamelize");
        expect(lock.version).equal("1.2.0");

        expect(p.getLockedVersion("ava")).equal("0.25.0");
        expect(p.getLockedVersion("badpkg")).equal(null);
    });

    it("Should fail directory without package.json", async () => {
        // "." is the empty tmpdir
        return expect(proj.load(".", projOpts)).to.be.rejectedWith("ENOENT");
    });

    it("Should fail with bad package name", async () => {
        return expect(proj.load("XXXBADPACKAGE", projOpts)).to.be.rejectedWith("404 Not Found: XXXBADPACKAGE");
    });

    it("Should load from alternate registry", async () => {
        const opts = { ...localRegistryDefaults.npmLocalProxyOpts, ...projOpts };
        // FIXME(mark): Once we actually publish @usys/cloud publicly, this
        // test is no longer a great test. Change the package to something
        // that we know is definitely only present in the local registry.
        const p = await proj.load("@usys/cloud@0.0.1", opts);
        expect(p).to.be.an("object");
        expect(p.manifest.name).equal("@usys/cloud");
        expect(p.manifest.version).equal("0.0.1");
        expect(p.manifest.dependencies["@usys/adapt"]).equal("0.0.1");

        const lock = p.packageLock;
        expect(lock.name).equal("@usys/cloud");
        expect(lock.version).equal("0.0.1");
    });
});
