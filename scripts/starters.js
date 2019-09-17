#!/usr/bin/env node

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


const chalk = require("chalk").default;
const program = require("commander");
const execa = require("execa");
const fs = require("fs-extra");
const path = require("path");

const starterList = [
    "blank",
    "hello-node",
    "hello-react-node-postgres",
    "moviedb-react-node",
];
const repoRoot = path.resolve(path.join(__dirname, ".."));
const starterRoot = path.join(repoRoot, "starters");
const starters = starterList
    .map((name) => ({
        name,
        dir: path.join(starterRoot, name),
        url: `git@gitlab.com:adpt/starters/${name}.git`,
    }))

program
    .command("update")
    .description("Update all starters")
    .action(cliHandler(commandUpdate));

program
    .command("tag <tag>")
    .description("Tag all starters")
    .action(cliHandler(commandTag));

program.on("command:*", () => {
    console.error(chalk.bold(`\nInvalid command: ${program.args.join(' ')}\n`));
    program.help(); // Exits
});

if (process.argv.length <= 2) {
    program.help(); // Exits
}

program.parse(process.argv);

function cliHandler(func) {
    return (...args) => {
        try {
            func(...args)
                .then(() => {
                    process.exit(0);
                })
                .catch((err) => {
                    console.log("ERROR:", err.message);
                    process.exit(1);
                });
        } catch (err) {
            console.log("ERROR:", err);
        }
    };
}

async function exec(argsIn, options = {}) {
    const wd = path.relative(repoRoot, options.cwd || process.cwd());
    console.log(`\n[${wd}] ` + argsIn.join(" "));
    const prog = argsIn[0];
    const subproc = execa(prog, argsIn.slice(1), options);
    subproc.stdout.pipe(process.stdout);
    subproc.stderr.pipe(process.stderr);
    return subproc;
}

async function foreachStarter(func) {
    for (const s of starters) {
        await func(s);
    }
}

async function gitHasChanges(gitDir) {
    const { stdout } = await exec(["git", "status", "--porcelain"], { cwd: gitDir });
    return stdout !== "";
}

async function gitCheckout(gitDir, branch) {
    await exec(["git", "checkout", branch], { cwd: gitDir });
}

async function gitPullFF(gitDir) {
    await exec(["git", "pull", "--ff-only"], { cwd: gitDir });
}

async function gitTag(gitDir, tag) {
    await exec(["git", "tag", tag], { cwd: gitDir });
}

async function gitPush(gitDir, what, remote = "origin") {
    await exec(["git", "push", remote, what], { cwd: gitDir });
}

async function commandUpdate() {
    await fs.ensureDir(starterRoot);
    await foreachStarter(async (s) => {
        if (! await fs.pathExists(s.dir)) {
            await exec(["git", "clone", s.url], { cwd: starterRoot })
        }
        if (await gitHasChanges(s.dir)) {
            throw new Error(`Cannot update starter ${s.name}: Uncommitted changes present`);
        }
        await gitCheckout(s.dir, "master");
        await gitPullFF(s.dir);
    });
}

async function commandTag(tag) {
    await foreachStarter(async (s) => {
        await gitTag(s.dir, tag);
        await gitPush(s.dir, tag);
    });
}
