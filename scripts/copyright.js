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


const execa = require("execa");
const path = require('path')

const copyrightHolder = "Unbounded Systems, LLC";
const excludes = [
    "^cli/test_projects",
    "^cloud/test/fixtures",
];

function parseArgs() {
    let fix = false;

    const args = process.argv.slice(2);
    while (args[0] && args[0].startsWith("-")) {
        const flag = args.shift();
        switch (flag) {
            case "--fix":
                fix = true;
                break;
            default:
                throw new Error(`Invalid flag '${flag}'`);
        }
    }

    return {
        fix,
        files: args,
    };
}

async function main() {
    const args = parseArgs();

    const gitRoot = await execa.stdout("git", ["rev-parse", "--show-toplevel"]);

    const subprocArgs = [
        "--copyrightHolder", copyrightHolder,
        "--templateId", "apache",
        "--excludeCommits", "Add copyright headers",
    ];

    if (args.fix) subprocArgs.push("--fix");

    if (excludes.length) subprocArgs.push("--exclude", excludes.join(","));
    if (args.files.length) {
        const relFiles = args.files
            .map(f => path.relative(gitRoot, f))
            .map(f => `^${f}$`);
        subprocArgs.push("--include", relFiles.join(","));
    }

    try {
        const subproc = execa("copyright-header", subprocArgs, {
            cwd: gitRoot,
            preferLocal: true
        });
        subproc.stdout.pipe(process.stdout);
        subproc.stderr.pipe(process.stderr);
        await subproc;

    } catch (err) {
        if (err.message.includes("Need to fix copyright header")) {
            console.log(
                `\n************\n\n` +
                `  To fix copyright headers in staged files, run:\n\n` +
                `  yarn run copyright-fix-staged\n` +
                `\n************\n`);
            process.exit(1);
        } else {
            throw err;
        }
    }
}

main().then(() => {
    console.log("Complete!");
})
.catch((err) => {
    console.error(err);
    process.exit(1);
});
