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

import { normalizeWithDrive } from "@adpt/utils";
import should from "should";
import { findNodeModulesParent } from "../src/packageinfo";

describe("findNodeModulesParent", () => {
    it("Should return parent", () => {
        should(findNodeModulesParent("/a/b/node_modules/")).equal(normalizeWithDrive("/a/b"));
    });

    it("Should return undefined for root", () => {
        should(findNodeModulesParent("/")).be.Undefined();
    });

    it("Should return highest parent", () => {
        should(findNodeModulesParent("/a/node_modules/b/node_modules/c/d/node_modules/e/f"))
            .equal(normalizeWithDrive("/a"));
    });

    it("Should return highest parent if root", () => {
        should(findNodeModulesParent("/node_modules/b/node_modules/c/d/node_modules/e/f"))
            .equal(normalizeWithDrive("/"));
    });

    it("Should return undefined if node_modules not present", () => {
        should(findNodeModulesParent("/a/b/c/d/e")).be.Undefined();
    });

    it("Should normalize directory", () => {
        should(findNodeModulesParent("/a/b/node_modules/..")).be.Undefined();
    });
});
