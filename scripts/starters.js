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


const utils = require("@adpt/utils");
const chalk = require("chalk").default;
const program = require("commander");
const execa = require("execa");
const fs = require("fs-extra");
const globby = require("globby");
const path = require("path");

const starterListComplete = [
    "blank",
    "hello-node",
    "hello-react-node-postgres",
    "moviedb-react-node",
];
const repoRoot = path.resolve(path.join(__dirname, ".."));
const adaptPath = path.resolve(path.join(repoRoot, "cli", "bin", "run"));
const starterRoot = process.env.ADAPT_UNIT_TESTS ?
    path.resolve("./starters") : path.join(repoRoot, "starters");
let starters;

program
    .option("-o, --only <regex>", "Only process starters that match a regular expression", "");

program
    .command("audit")
    .description("Check starter package.json files for audit issues")
    .action(cliHandler(commandAudit));

program
    .command("run <command...>")
    .description("Run a command in all starters")
    .action(cliHandler(commandRun));

program
    .command("update")
    .description("Update all starters")
    .action(cliHandler(commandUpdate));

program
    .command("tag <tag>")
    .description("Tag all starters")
    .option('-f, --force', 'Move the tag if it already exists')
    .action(cliHandler(commandTag));

program.on("command:*", () => {
    console.error(chalk.bold(`\nInvalid command: ${program.args.join(' ')}\n`));
    program.help(); // Exits
});

/**
 * Runs after argument parsing, but before the commandXxx function.
 */
function init() {
    const starterRegex = RegExp(program.opts().only);
    const starterList = starterListComplete.filter(s => starterRegex.test(s));
    starters = starterList
        .map((name) => ({
            name,
            dir: path.join(starterRoot, name),
            url: gitUrl(name),
        }));
}

function gitUrl(name) {
    const token = process.env.ADAPT_WEB_TOKEN || process.env.CI_JOB_TOKEN;
    const prefix = token ?
        `https://gitlab-ci-token:${token}@gitlab.com/` :
        `git@gitlab.com:`;
    return `${prefix}adpt/starters/${name}.git`;
}

function cliHandler(func) {
    return (...args) => {
        try {
            init();

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
    const cwd = options.cwd || process.cwd();
    const wd = cwd.startsWith(repoRoot) ? path.relative(repoRoot, cwd) : cwd;
    console.log(chalk.bold(`\n[${wd}] ` + argsIn.join(" ")));
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

async function gitTag(gitDir, tag, opts = {}) {
    const args = ["git", "tag"];
    if (opts.force) args.push("--force");
    args.push(tag);
    await exec(args, { cwd: gitDir });
}

async function gitPush(gitDir, what, remote = "origin") {
    if (process.env.ADAPT_UNIT_TESTS) return;
    await exec(["git", "push", remote, what], { cwd: gitDir });
}

async function adapt(args, opts = {}) {
    await exec(["node", adaptPath, ...args], opts);
}

async function yarn(args, opts = {}) {
    await exec(["yarn", ...args], opts);
}

async function commandAudit() {
    const origDir = process.cwd();

    // Ensures starters are up to date AND have no uncommitted changes
    await commandUpdate();

    const errors = [];

    await foreachStarter(async (s) => {
        await utils.withTmpDir(async (tmp) => {
            try {
                process.chdir(tmp);
                await adapt(["new", s.dir, "."]);
                for await (const pj of globby.stream("**/package.json", { absolute: true })) {
                    const pjDir = path.dirname(pj.toString());
                    await yarn([], { cwd: pjDir });
                    try {
                        await yarn([ "audit" ], { cwd: pjDir });
                    } catch (err) {
                        errors.push({
                            name: s.name,
                            file: pj.slice(tmp.length + 1),
                            stdout: err.stdout,
                            summary: utils.grep(err.stdout, /vulnerabilities found/g).join("\n"),
                        });
                    }
                }

            } finally {
                process.chdir(origDir);
            }
        });
    });

    if (errors.length) {
        console.error("\n" + chalk.redBright("Audit failed:"));
        for (const e of errors) {
            console.error(chalk.bold(`${e.name}: ${e.file}`));
            console.error(`  ${e.summary}`);
        }
        process.exit(1);
    }
}

async function commandRun(args) {
    await foreachStarter(async (s) => {
        await exec(args, { cwd: s.dir });
    });
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

async function commandTag(tag, cmd) {
    const tagOpts = cmd.opts().force ? { force: true } : undefined;

    await foreachStarter(async (s) => {
        await gitTag(s.dir, tag, tagOpts);
        await gitPush(s.dir, tag);
    });
}

function main() {
    if (process.argv.length <= 2) {
        program.help(); // Exits
    }

    program.parse(process.argv);
}

main();
