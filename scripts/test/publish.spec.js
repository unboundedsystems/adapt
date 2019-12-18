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

const { grep } = require("@adpt/utils");
const { mochaTmpdir } = require("@adpt/testutils");
const db = require("debug");
const execa = require("execa");
const fs = require("fs-extra");
const { resolve, join } = require("path");
const should = require("should");

const { git } = require("./utils/git");
const { useFixture } = require("./utils/git_fixture");

const debug = db("adapt:test");

const releaseDir = resolve(__dirname, "..", "release");
const publishExe = join(releaseDir, "publish.sh");

/**
 * @param {any[] | readonly string[] | string[]} args
 * @param {execa.Options<string>} [options]
 */
async function publish(args, options) {
    const subproc = execa(publishExe, args, options);
    if (debug.enabled) {
        subproc.stdout.pipe(process.stdout);
        subproc.stderr.pipe(process.stderr);
    }
    const ret = await subproc;
    should(ret.stdout).not.match(/ERROR/);
    should(ret.stderr).not.match(/ERROR/);
    return ret;
}

/**
 * @param {string[]} args
 * @param {execa.Options<string>} [options]
 */
async function publishError(args, options = {}) {
    const opts = { all: true, ...options };
    try {
        await publish(args, opts);
    } catch (err) {
        throw new Error(`${err.message}\n${err.all}`);
    }
}

/**
 * @param {string[]} argsIn
 */
async function getPublishCommand(argsIn) {
    const { stdout } = await publish(["--dry-run", ...argsIn]);
    const lines = await grep(stdout, /^\[SKIPPING\].*lerna publish/);
    should(lines).have.length(1);
    const words = lines[0].split(/\s+/);
    should(words.shift()).equal("[SKIPPING]");
    should(words.shift()).match(/lerna$/);
    should(words.shift()).equal("publish");

    let args = [];
    const options = new Map();
    while (words[0]) {
        const w = words.shift();
        if (!w.startsWith("-")) {
            args = [w, ...words];
            break;
        }
        const [ opt, val ] = w.split("=");
        options.set(opt, val === undefined ? true : val);
    }
    return { args, options };
}

describe("Publish options", function() {
    this.timeout("20s");

    mochaTmpdir.all("adapt-script-publish");

    before(async () => {
        await useFixture("simple");
    });

    it("Should --debug enable lerna debug logging", async () => {
        const { args, options } = await getPublishCommand(["--debug", "--no-build", "prerelease"]);
        should(args).eql(["prerelease"]);
        should(options.get("--loglevel")).equal("debug");
    });

    it("Should run 'make build' by default", async function() {
        this.timeout("5m");
        const { stdout } = await publish(["--dry-run", "prerelease"]);
        should(stdout).not.match(/SKIPPING.*make build/);
        should(stdout).match(/^Build success/m);
    });

    it("Should not run 'make build' with --no-build", async () => {
        const { stdout } = await publish(["--dry-run", "--no-build", "prerelease"]);
        should(stdout).match(/SKIPPING.*make build/);
        should(stdout).not.match(/^Build success/m);
    });

    it("Should not allow invalid dist-tags", async () => {
        await should(publishError(["--no-build", "--dry-run", "--dist-tag", "1.2.3", "prerelease"]))
            .be.rejectedWith(/Invalid tag '1.2.3'/);
        await should(publishError(["--no-build", "--dry-run", "--dist-tag", "-foo", "prerelease"]))
            .be.rejectedWith(/Invalid tag '-foo'/);
        await should(publishError(["--no-build", "--dry-run", "--dist-tag", "v1", "prerelease"]))
            .be.rejectedWith(/Invalid tag 'v1'/);
    });

    const registryEnv = {
        env: { NPM_CONFIG_REGISTRY: "http://fakereg" }
    };

    it("Should not allow NPM registry to be set without --local", async () => {
        await should(publishError(["--no-build", "--dry-run", "prerelease"], registryEnv))
            .be.rejectedWith(/NPM_CONFIG_REGISTRY must NOT be set/);
    });

    it("Should require NPM registry to be set with --local", async () => {
        await should(publishError(["--no-build", "--dry-run", "--local", "prerelease"]))
            .be.rejectedWith(/NPM_CONFIG_REGISTRY must be set/);
    });
});

describe("Publish branching", function() {
    this.timeout("20s");

    mochaTmpdir.all("adapt-script-publish");

    before(async () => {
        await useFixture("simple");
        await git(["checkout", "-b", "other-branch"]);
    });

    it("Should only update git on release/master", async () => {
        await git(["checkout", "master"]);
        let ret = await publish(["--dry-run", "minor"]);
        should(ret.stdout).match(/^Already up to date/m);

        await git(["checkout", "release-1.0"]);
        ret = await publish(["--dry-run", "patch"]);
        should(ret.stdout).match(/^Already up to date/m);

        await git(["checkout", "other-branch"]);
        ret = await publish(["--dry-run", "dev"]);
        should(ret.stdout).not.match(/^Already up to date/m);
    });

    it("Should only allow dev on non-release/master", async () => {
        await git(["checkout", "other-branch"]);
        const { args } = await getPublishCommand(["--dry-run", "dev"]);
        should(args).eql(["prerelease"]);

        await git(["checkout", "release-1.0"]);
        await should(publishError(["--dry-run", "dev"]))
            .be.rejectedWith(/Do not use 'dev' while on a release branch/);

        await git(["checkout", "master"]);
        await should(publishError(["--dry-run", "dev"]))
            .be.rejectedWith(/Do not use 'dev' while on a release branch/);
    });

    it("Should only allow numbered release on master", async () => {
        await git(["checkout", "master"]);
        const { args } = await getPublishCommand(["--dist-tag", "beta", "2.0.0"]);
        should(args).eql(["from-package"]);

        await git(["checkout", "release-1.0"]);
        await should(publishError(["--dry-run", "--dist-tag", "beta", "2.0.0"]))
            .be.rejectedWith(/must be made from master/);

        await git(["checkout", "other-branch"]);
        await should(publishError(["--dry-run", "--dist-tag", "beta", "2.0.0"]))
            .be.rejectedWith(/must be made from master/);
    });

    it("Should only allow minor release on master", async () => {
        await git(["checkout", "master"]);
        const { args } = await getPublishCommand(["--dist-tag", "beta", "minor"]);
        should(args).eql(["minor"]);

        await git(["checkout", "release-1.0"]);
        await should(publishError(["--dry-run", "--dist-tag", "beta", "minor"]))
            .be.rejectedWith(/must be made from master/);

        await git(["checkout", "other-branch"]);
        await should(publishError(["--dry-run", "--dist-tag", "beta", "minor"]))
            .be.rejectedWith(/must be made from master/);
    });

    it("Should error with uncommitted changes", async () => {
        try {
            await git(["checkout", "master"]);
            await fs.writeFile("help.txt", "some contents\n");
            await should(publishError(["--dry-run", "prerelease"]))
                .be.rejectedWith(/source tree must not have any modifications/);
        } finally {
            await fs.remove("help.txt");
        }
    });
});
