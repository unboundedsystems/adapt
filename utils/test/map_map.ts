/*
 * Copyright 2018 Unbounded Systems, LLC
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

import should from "should";

import { mapMap } from "../src/map_map";

describe("mapMap", () => {
    it("Should do basic mapping to an array", () => {
        const m = new Map();
        m.set("a", 1);
        m.set("b", 2);

        const arr = mapMap(m, (k, v) => [k, v]);
        should(arr).eql([
            ["a", 1],
            ["b", 2],
        ]);
    });

    it("Should not call function on empty Map", () => {
        const m = new Map();
        const arr = mapMap(m, (_k, _v) => {
            throw new Error(`Should not happen`);
        });
        should(arr).eql([]);
    });
});
