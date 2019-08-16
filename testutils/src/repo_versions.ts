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

import { repoDirs } from "@adpt/utils";
import fs from "fs-extra";
import path from "path";

export type RepoVersions = typeof repoDirs;
// tslint:disable-next-line:no-object-literal-type-assertion
export const repoVersions: RepoVersions = {} as RepoVersions;

const dirNames: (keyof RepoVersions)[] = Object.keys(repoDirs) as any[];

for (const dir of dirNames) {
    const pkgJ = fs.readJsonSync(path.join(repoDirs[dir], "package.json"));
    repoVersions[dir] = pkgJ.version;
}
