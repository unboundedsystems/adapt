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

const { grep, repoRootDir }= require("@adpt/utils");
const db = require("debug");
const execa = require("execa");
const path = require("path");
const should = require("should");

const debug = db("adapt:test");

const releaseDir = path.resolve(__dirname, "..", "release");
const publishExe = path.join(releaseDir, "publish.sh");

async function publish(args, options = {}) {
    const opts = { cwd: repoRootDir, ...options };
    const subproc = execa(publishExe, args, opts);
    if (debug.enabled) {
        subproc.stdout.pipe(process.stdout);
        subproc.stderr.pipe(process.stderr);
    }
    return subproc;
}

async function publishError(args, options = {}) {
    const opts = { all: true, ...options };
    try {
        await publish(args, opts);
    } catch (err) {
        throw new Error(`${err.message}\n${err.all}`);
    }
}

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

    it("Should --debug enable lerna debug logging", async () => {
        const { args, options } = await getPublishCommand(["--debug", "--no-build", "prerelease"]);
        should(args).eql(["prerelease"]);
        should(options.get("--loglevel")).equal("debug");
    });

    it("Should run 'make build' by default", async function() {
        this.timeout("5m");
        const { stdout } = await publish(["--dry-run", "prerelease"]);
        should(stdout).not.match(/SKIPPING.*make build/);
        should(stdout).match(/cloud: docs COMPLETE/);
    });

    it("Should not run 'make build' with --no-build", async () => {
        const { stdout } = await publish(["--dry-run", "--no-build", "prerelease"]);
        should(stdout).match(/SKIPPING.*make build/);
        should(stdout).not.match(/cloud: docs COMPLETE/);
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
