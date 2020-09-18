/*
 * Copyright 2018-2020 Unbounded Systems, LLC
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

 /** Simple command line diff utility for use with kubectl on Windows */

import { diffLines } from "diff";
import fs from "fs";
import path from "path";

let exitCode = 0;

function fileOrEmpty(filename: string) {
    try {
        return fs.readFileSync(filename).toString();
    } catch (err) {
        if (err.code === "ENOENT") return "";
        throw err;
    }
}

function splitLines(s: string) {
    return s.match(/[^\n]*\n|[^\n]+/g) || [];
}

function fileType(filename: string): "FILE" | "DIR" | "NONE" {
    try {
        const stat = fs.statSync(filename);
        return stat.isDirectory() ? "DIR" : "FILE";
    } catch (err) {
        if (err.code === "ENOENT") return "NONE";
        throw err;
    }
}

function listFiles(dir: string, list: string[] = [], stripDir = true) {
    const dirList = fs.readdirSync(dir);

    dirList.forEach((f) => {
        const full = stripDir ? f : path.join(dir, f);
        if (fileType(f) === "DIR") {
            listFiles(full, list, false);
        } else {
            list.push(full);
        }
    });

    return list;
}

function diffFiles(path1: string, path2: string, header = false) {
    const file1 = fileOrEmpty(path1);
    const file2 = fileOrEmpty(path2);
    const diff = diffLines(file1, file2);

    diff.forEach((part) => {
        if (!part.added && !part.removed) return;
        if (header) {
            process.stdout.write(`diff ${path1} ${path2}\n`);
            header = false;
        }
        exitCode = 1;
        const sym = part.added ? "+ " : "- ";
        splitLines(part.value).forEach((l) => process.stdout.write(sym + l));
    });
}

function diffDirs(dir1: string, dir2: string) {
    const paths = new Set<string>(listFiles(dir1));
    listFiles(dir2).forEach((f) => paths.add(f));
    const sorted = [...paths].sort();
    sorted.forEach((p) => {
        const f1 = path.join(dir1, p);
        const f2 = path.join(dir2, p);
        diffFiles(f1, f2, true);
    });
}

function main() {
    const args = process.argv.slice(2).filter((a) => !a.startsWith("-"));
    if (args.length !== 2) {
        // tslint:disable-next-line: no-console
        console.error("diff: Two paths must be specified");
        process.exit(2);
    }
    const types = args.map(fileType);
    if (types.includes("FILE") && types.includes("DIR")) {
        // tslint:disable-next-line: no-console
        console.error("diff: Cannot compare a file and a directory");
    }

    if (types.includes("FILE")) {
        diffFiles(args[0], args[1]);
    } else {
        diffDirs(args[0], args[1]);
    }

    process.exit(exitCode);
}

main();
