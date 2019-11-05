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

import { sha256hex } from "@adpt/utils";
import should from "should";
import { makeResourceName } from "../src/common";

describe("makeResourceName", () => {
    it("Should generate a name with max sha", () => {
        const resourceName = makeResourceName(/[^a-z]/g, 100);
        const name = resourceName("mykey", "someid", "adeployid");
        const parts = name.split("-");
        should(parts[0]).equal("mykey");
        should(parts[1]).have.length(32);
        should(parts[1]).equal(sha256hex("someidadeployid").slice(0, 32));
    });

    it("Should lower case name", () => {
        const resourceName = makeResourceName(/[^a-z]/g, 100);
        const name = resourceName("MyKey", "someid", "adeployid");
        const parts = name.split("-");
        should(parts[0]).equal("mykey");
        should(parts[1]).have.length(32);
        should(parts[1]).equal(sha256hex("someidadeployid").slice(0, 32));
    });

    it("Should generate a name with shorter sha", () => {
        const resourceName = makeResourceName(/[^a-z]/g, 35);
        const name = resourceName("mykey", "someid", "adeployid");
        const parts = name.split("-");
        should(parts[0]).equal("mykey");
        should(parts[1]).have.length(29);
        should(parts[1]).equal(sha256hex("someidadeployid").slice(0, 29));
    });

    it("Should generate a name with shortest sha", () => {
        const resourceName = makeResourceName(/[^a-z]/g, 11);
        const name = resourceName("mykey", "someid", "adeployid");
        should(name).have.length(11);
        const parts = name.split("-");
        should(parts[0]).equal("my");
        should(parts[1]).have.length(8);
        should(parts[1]).equal(sha256hex("someidadeployid").slice(0, 8));
    });

    it("Should error without global flag", () => {
        should(() => makeResourceName(/[^a-z]/, 11)).throwError(/must be a RegExp with the global flag/);
    });

    it("Should strip invalid chars", () => {
        const resourceName = makeResourceName(/[^a-z]/g, 14);
        const name = resourceName("12my.k*^#$)ey43", "someid", "adeployid");
        should(name).have.length(14);
        const parts = name.split("-");
        should(parts[0]).equal("mykey");
        should(parts[1]).have.length(8);
        should(parts[1]).equal(sha256hex("someidadeployid").slice(0, 8));
    });
});
