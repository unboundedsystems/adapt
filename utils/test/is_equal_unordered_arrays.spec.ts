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
import { isEqualUnorderedArrays } from "../src/index";

describe("isEqualUnorderedArray Tests", () => {

    it("Should compare non-object values", () => {
        should(isEqualUnorderedArrays(1, 1)).True();
        should(isEqualUnorderedArrays("foo", "foo")).True();
        should(isEqualUnorderedArrays(1, 2)).False();
        should(isEqualUnorderedArrays("foo", "bar")).False();
    });

    it("Should compare trivial arrays", () => {
        should(isEqualUnorderedArrays([1, 2], [1, 2])).True();
        should(isEqualUnorderedArrays(["foo"], ["foo"])).True();
        should(isEqualUnorderedArrays([1], [1, 2])).False();
        should(isEqualUnorderedArrays(["foo"], ["bar"])).False();
        should(isEqualUnorderedArrays(["foo", "bar"], ["bar", "foo"])).True();
    });

    it("Should compare arrays of objects", () => {
        const o1 = { x: 1, y: 1 };
        const o2 = { x: 1, y: 2 };
        const o3 = { a: 1, b: 1 };
        should(isEqualUnorderedArrays([o1, o2, o3], [o1, o2, o3])).True();
        should(isEqualUnorderedArrays([o1, o2, o3], [o1, o3, o2])).True();
        should(isEqualUnorderedArrays([o1, o2], [o1, o3])).False();
    });

    it("Should deeply compare objects that contain arrays", () => {
        const inner1 = { x: 1, y: 1 };
        const inner2 = { x: 1, y: 2 };
        const inner3 = { a: 1, b: 1 };
        const o1 = { x: [inner1, inner2, inner3] };
        const o2 = { x: [inner2, inner3, inner1] };
        const o3 = { y: [inner1, inner2, inner3] };
        const o4 = { items: [o1, o2] };
        const o5 = { items: [o2, o1] };
        const o6 = { items: [o1, o3] };
        should(isEqualUnorderedArrays(o1, o2)).True();
        should(isEqualUnorderedArrays(o1, o3)).False();
        should(isEqualUnorderedArrays(o4, o5)).True();
        should(isEqualUnorderedArrays(o4, o6)).False();
    });

    it("Should handle null", () => {
        should(isEqualUnorderedArrays(null, null)).True();
    });
});
