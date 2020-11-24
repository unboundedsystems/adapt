/*
 * Copyright 2018-2019 Unbounded Systems, LLC
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

import * as fs from "fs";
import * as path from "path";

/**
 * Given a directory path in the execution directory (i.e. "dist"), return
 * the corresponding source directory.
 * @param dirname Runtime execution directory to translate into source
 *     directory. Typically just pass your local __dirname for the current
 *     file. Must be absolute path.
 */
export function sourceDir(dirname: string) {
    if (!path.isAbsolute(dirname)) {
        throw new Error(`'${dirname} is not an absolute path`);
    }
    return dirname.replace(path.sep + "dist", "");
}

/**
 * Given a directory path in the execution directory (i.e. "dist"), return
 * a set of directory paths for the enclosing NPM package.
 * @param dirname Runtime execution directory within an NPM package.
 *     Typically just pass your local __dirname for the current
 *     file.
 */
export function findPackageDirs(dirname: string) {
    let root: string | null = null;
    let repoRoot: string | null = null;

    dirname = path.resolve(dirname);
    do {
        if (root == null) {
            const pkgJson = path.join(dirname, "package.json");
            if (fs.existsSync(pkgJson)) root = dirname;
        }
        const dotGit = path.join(dirname, ".git");
        if (fs.existsSync(dotGit)) {
            repoRoot = dirname;
            break;
        }

        const parent = path.dirname(dirname);
        if (parent === dirname) {
            break;
        }
        dirname = parent;
    } while (true);

    if (root == null) {
        throw new Error(`Error finding package directories`);
    }

    return {
        root,
        repoRoot: repoRoot || "/dev/null", // Not supported outside of a git repo
        test: path.join(root, "test"),
        dist: path.join(root, "dist"),
    };
}

export const utilsDirs = findPackageDirs(__dirname);
export const repoRootDir = utilsDirs.repoRoot;
export const repoDirs = {
    "core": path.join(repoRootDir, "core"),
    "cli": path.join(repoRootDir, "cli"),
    "cloud": path.join(repoRootDir, "cloud"),
    "dom-parser": path.join(repoRootDir, "dom-parser"),
    "testutils": path.join(repoRootDir, "testutils"),
    "utils": path.join(repoRootDir, "utils"),
};

export function normalizeWithDrive(p: string, cwd = process.cwd()) {
    const root = path.parse(cwd).root;
    return path.normalize(path.join(root, p));
}

/**
 * Given a native platform path string (i.e. can contain backslash path
 * separators on Windows), returns the path using the POSIX path separator
 * (forward slash).
 * @param p A path string in a form accepted by the native platform.
 */
export function posixPath(p: string) {
    if (process.platform !== "win32") return p;
    return path.posix.join(...p.split(path.sep));
}
