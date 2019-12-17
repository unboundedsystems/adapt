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

const utils = require("@adpt/utils");
const execa = require("execa");
const path = require("path");
const should = require("should");

const releaseDir = path.resolve(__dirname, "..", "release");
const publishExe = path.join(releaseDir, "publish.sh");

async function publish(args, options) {
    const subproc = execa(publishExe, args, options);
    subproc.stdout.pipe(process.stdout);
    subproc.stderr.pipe(process.stderr);
    return subproc;
}

async function getPublishCommand(argsIn) {
    const { stdout } = await publish(["--dry-run", ...argsIn]);
    const lines = await utils.grep(stdout, /^\[SKIPPING\].*lerna publish/);
    should(lines).have.length(1);
    const words = lines[0].split(/\s+/);
    should(words.shift()).equal("[SKIPPING]");
    should(words.shift()).match(/lerna$/);
    should(words.shift()).equal("publish");

    let args = [];
    const options = new Map();
    while (words[0]) {
        const w = words.shift();
        console.log("WORD:", w);
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

    it("Should --debug enable debug", async () => {
        const { args, options } = await getPublishCommand(["--debug", "--no-build", "prerelease"]);
        should(args).eql(["prerelease"]);
        should(options.get("--loglevel")).equal("debug");
    });
});
