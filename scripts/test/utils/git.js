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

const db = require("debug");
const execa = require("execa");

const debug = db("adapt:test");

/**
 * @param {string[]} args
 * @param {execa.Options<string>} [options]
 */
async function git(args, options) {
    debug(`Running: git ${args.join(" ")}`);
    const subproc = execa("git", args, options);
    if (debug.enabled) {
        subproc.stdout.pipe(process.stdout);
        subproc.stderr.pipe(process.stderr);
    }
    return subproc;
}

exports.git = git;
exports.default = git;

/**
 * Returns an array with the subject (title) of each commit.
 */
async function commits() {
    const { stdout } = await git(["log", "--format=format:%s"]);
    return stdout.split("\n");
}
exports.commits = commits;

async function tags() {
    const { stdout } = await git(["tag"]);
    return stdout.split("\n");
}
exports.tags = tags;
