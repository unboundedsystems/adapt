/*
 * Copyright 2020 Unbounded Systems, LLC
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

import findUp from "find-up";
import fs from "fs-extra";
import { dirname, join, resolve, sep } from "path";

/*
 * IMPORANT NOTE: As of global-dirs 2.0.1, the yarn path is often incorrect,
 * particularly when the user is root (as in a container).
 * See: https://github.com/sindresorhus/global-dirs/issues/13
 */
import { npm } from "global-dirs";

export enum InstallType {
    npm = "npm",
    npmGlobal = "npmGlobal",
    yarn = "yarn",
    yarnGlobal = "yarnGlobal",
    unknown = "unknown",
}

export async function installType(path: string): Promise<InstallType> {
    const dir = await getDir(path);
    if (isYarnGlobal(dir)) return InstallType.yarnGlobal;
    if (isNpmGlobal(dir)) return InstallType.npmGlobal;
    const manager = await findManager(dir);
    if (manager) return manager;
    return InstallType.unknown;
}

/**
 * Returns `true` if `path` is within a yarn global install directory.
 */
function isYarnGlobal(path: string) {
    const slashes = (s: string) => sep + s + sep;
    const winPath = join("Yarn", "Data", "global");
    const otherPath = join("yarn", "global");
    return path.includes(slashes(otherPath)) || path.includes(slashes(winPath));
}

/**
 * Returns `true` if `path` is within the npm global install directory.
 */
function isNpmGlobal(path: string) {
    return path.startsWith(npm.prefix) && !isYarnGlobal(path);
}

async function findManager(dir: string) {
    const lockFile = await findUp([ "yarn.lock", "package-lock.json" ], { cwd: dir });
    if (!lockFile) return undefined;

    if (lockFile.endsWith("yarn.lock")) return InstallType.yarn;
    return InstallType.npm;
}

async function getDir(path: string) {
    const stat = await fs.stat(resolve(path));
    return stat.isDirectory() ? path : dirname(path);
}
