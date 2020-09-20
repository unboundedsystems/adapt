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

import * as path from "path";
import expect from "should";

import * as paths from "../src/paths";

const actualRepoRoot = path.dirname(process.cwd());

describe("Paths tests", () => {
    it("Should have correct repo root", () => {
        expect(paths.utilsDirs.repoRoot).equals(actualRepoRoot);
        expect(paths.repoRootDir).equals(actualRepoRoot);
    });

    it("Should have correct adapt package root", () => {
        expect(paths.repoDirs.core).equals(path.join(actualRepoRoot, "core"));
    });
    it("Should have correct utils dist", () => {
        expect(paths.utilsDirs.dist).equals(path.join(actualRepoRoot, "utils", "dist"));
    });
    it("Should have correct utils test", () => {
        expect(paths.utilsDirs.test).equals(path.join(actualRepoRoot, "utils", "test"));
    });
});
