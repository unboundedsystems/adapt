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

import * as fs from "fs-extra";
import * as path from "path";

const templatePackageJson = {
    version: "1.0.0",
    license: "UNLICENSED",
    dependencies: {},
};

export interface PkgJson {
    name: string;
    dependencies?: { [name: string]: string };
    [key: string]: string | object | undefined;
}

export interface Package {
    pkgJson: PkgJson;
    // value string is file contents
    files?: { [ filePath: string ]: string };
    // value string is a path to source file to copy
    copy?: { [ filePath: string ]: string };
}

async function writePackageJson(dir: string, overrides: PkgJson) {
    const contents = { ...templatePackageJson, ...overrides };
    await fs.outputJson(path.join(dir, "package.json"), contents, { spaces: 2 });
}

export async function writePackage(dir: string, pkg: Package) {
    await writePackageJson(dir, pkg.pkgJson);

    if (pkg.files) {
        for (const f of Object.keys(pkg.files)) {
            await fs.outputFile(path.join(dir, f), pkg.files[f]);
        }
    }
    if (pkg.copy) {
        for (const f of Object.keys(pkg.copy)) {
            await fs.copy(pkg.copy[f], path.join(dir, f));
        }
    }
}
