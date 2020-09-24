/*
 * Copyright 2019-2020 Unbounded Systems, LLC
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

import fs from "fs-extra";
import { isObject, isString, last } from "lodash";
import path from "path";

export interface PackageRegistry {
    findPath(moduleName: string, moduleVersion: string): Promise<string | undefined>;
}

export function createPackageRegistry(projectDir: string): PackageRegistry {
    return new LazyPackageRegistry(projectDir);
}

type PackageName = string;
type PackageId = string;
type PackagePath = string;
interface PkgJson {
    name: string;
    version: string;
    dependencies?: { [name: string]: string };
    [key: string]: string | object | undefined;
}

// Length to trim off the file component
const trimRight = "/package.json".length;

export class LazyPackageRegistry {
    nodeModulesDir: string;
    projectDir: string;
    pkgsToLoad?: Map<PackageName, PackagePath[]>;
    cache = new Map<PackageId, PackagePath>();

    constructor(projectDir: string) {
        this.projectDir = path.resolve(projectDir);
        this.nodeModulesDir = path.join(this.projectDir, "node_modules");

        if (!fs.pathExistsSync(this.nodeModulesDir)) {
            throw new Error(`Project directory ${this.projectDir} does not ` +
                `contain a node_modules folder`);
        }
    }

    findPath = async (pkgName: string, pkgVersion: string): Promise<PackagePath | undefined> => {
        if (!this.pkgsToLoad) await this.scanProject();

        const pkgPath = this.cache.get(packageId(pkgName, pkgVersion));
        if (pkgPath !== undefined) return pkgPath;

        return this.loadPackage(pkgName, pkgVersion);
    }

    async scanProject() {
        const pInfo = await this.projectInfo();
        this.cache.set(packageId(pInfo.name, pInfo.version), this.projectDir);

        await this.scanPackages();
    }

    async scanPackages() {
        const files = await findFiles(this.nodeModulesDir, "package.json");
        const dirs = files.map((f) => f.slice(0, -trimRight));

        // Trim off the root node_modules dir
        const trimLeft = this.nodeModulesDir.length + 1;
        const stripped = dirs.map((f) => f.slice(trimLeft));
        const names = stripped.map((s) => last(s.split(`${path.sep}node_modules${path.sep}`)));

        const packages = new Map<PackageName, PackagePath[]>();
        names.map((name, idx) => name && addPackage(name, dirs[idx]));

        this.pkgsToLoad = packages;
        return packages;

        function addPackage(pkgName: string, pkgPath: string) {
            // Ensure package names use forward slashes
            pkgName = pkgName.replace(/\\/g, "/");
            let paths = packages.get(pkgName);
            if (!paths) {
                paths = [];
                packages.set(pkgName, paths);
            }
            paths.push(pkgPath);
        }
    }

    async projectInfo() {
        const pjFile = path.join(this.projectDir, "package.json");
        let err = "unknown error";
        try {
            const pkgJ: PkgJson = await fs.readJSON(pjFile);
            if (!isObject(pkgJ)) err = `Invalid package.json file`;
            else if (!isString(pkgJ.name)) err = `Invalid package name`;
            else if (!isString(pkgJ.version)) err = `Invalid version`;
            else return pkgJ;

        } catch (e) {
            err = `Unable to open package.json file: ${e.message}`;
        }
        throw new Error(`Error reading project file ${pjFile}: ${err}`);

    }

    async loadPackage(pkgName: string, pkgVersion: string) {
        if (this.pkgsToLoad == null) {
            throw new Error(`Internal error: package registry packages is null`);
        }
        const pathList = this.pkgsToLoad.get(pkgName);
        if (pathList == null) return undefined;

        while (true) {
            const pkgPath = pathList.pop();
            if (pathList.length === 0) {
                // All entries for this pkgName have been loaded
                this.pkgsToLoad.delete(pkgName);
            }
            if (!pkgPath) break;

            const pkgJsonPath = path.join(pkgPath, "package.json");
            const pkgJson: PkgJson = await fs.readJSON(pkgJsonPath);
            if (pkgJson.name !== pkgName) {
                throw new Error(
                    `Package name in path doesn't match name in package.json ` +
                    `(${pkgJson.name} ${pkgJsonPath})`);
            }
            if (typeof pkgJson.version !== "string" || pkgJson.version.length === 0) {
                // Should just be a warning?
                throw new Error(`Invalid or missing version field in ${pkgJsonPath}`);
            }

            this.cache.set(packageId(pkgName, pkgJson.version), pkgPath);
            if (pkgJson.version === pkgVersion) return pkgPath;
        }
        return undefined;
    }
}

function packageId(pkgName: string, pkgVersion: string): PackageId {
    return `${pkgName}@${pkgVersion}`;
}

async function findFiles(rootDir: string, filename: string, list: string[] = []) {
    const dirList = await fs.readdir(rootDir);

    for (const f of dirList) {
        const full = path.join(rootDir, f);
        const stat = await fs.stat(full);

        if (stat.isDirectory()) {
            await findFiles(full, filename, list);
        } else {
            if (f === filename) list.push(full);
        }
    }

    return list;
}
