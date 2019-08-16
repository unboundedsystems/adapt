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

import * as path from "path";
import * as readPkgUp from "read-pkg-up";

export interface PackageInfo {
    main: string;
    name: string;
    root: string;
    version: string;
}

export function findPackageInfo(dir: string): PackageInfo {
    const ret = readPkgUp.sync({cwd: dir, normalize: false });
    const pkgJson = ret.pkg;
    if (!pkgJson || !pkgJson.name || !pkgJson.version) {
        throw new Error(`Invalid plugin registration. Cannot find package.json info in directory ${dir}.`);
    }
    const root = path.dirname(ret.path);
    const main = path.resolve(path.join(root, pkgJson.main || "index.js"));
    return {
        main,
        name: pkgJson.name,
        root,
        version: pkgJson.version,
    };
}

/**
 * Traverse up the directory hierarchy from `dir` to find the parent of the
 * node_modules directory closest to root.
 * If no node_modules directory exists in the directory hierarchy, returns
 * undefined.
 */
export function findNodeModulesParent(dir: string): string | undefined {
    let lastParent: string | undefined;
    dir = path.resolve(dir);
    while (true) {
        const parsed = path.parse(dir);
        if (parsed.base === "node_modules") lastParent = parsed.dir;
        if (parsed.dir === dir) return lastParent;
        dir = parsed.dir;
    }
}
