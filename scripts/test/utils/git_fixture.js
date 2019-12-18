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

const { copy, ensureDir } = require("fs-extra");
const { git } = require("./git");
const path = require("path");

const fixtureDir = path.resolve(__dirname, "..", "fixtures");

async function newRepo(templateDir, targetDir) {
    await ensureDir(targetDir);
    await copy(templateDir, targetDir);
    const gitOpts = { cwd: targetDir };
    await git(["init"], gitOpts);
    await git(["add", "."], gitOpts);
    await git(["commit", "-m", "Initial commit"], gitOpts);
    await git(["branch", "release-1.0", "master"], gitOpts);
}
exports.newRepo = newRepo;

async function cloneRepo(originUrl, targetDir) {
    await git(["clone", originUrl, targetDir]);
}
exports.cloneRepo = cloneRepo;

async function createAndClone(templateDir, targetDir) {
    const originDir = path.resolve(targetDir, "origin");
    const cloneDir = path.resolve(targetDir, "clone");
    await newRepo(templateDir, originDir);
    await cloneRepo(originDir, cloneDir);
    return cloneDir;
}
exports.createAndClone = createAndClone;

async function useFixture(fixture) {
    const template = path.join(fixtureDir, fixture);
    const target = process.cwd();
    const cloneDir = await createAndClone(template, target);
    process.chdir(cloneDir);
}
exports.useFixture = useFixture;
