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

import should from "should";
import { grep } from "../src";

const text1 =
`There was a young lady named Bright
Whose speed was far faster than light;
She set out one day
In a relative way
And returned on the previous night.`;

describe("grep", () => {
    it("Should return no match for empty input", () => {
        should(grep("", "find")).eql([]);
    });

    it("Should throw error for empty pattern", () => {
        should(() => grep("some string", "")).throwError(/Invalid pattern/);
    });

    it("Should match with string", () => {
        should(grep(text1, "ight")).eql([
            "There was a young lady named Bright",
            "Whose speed was far faster than light;",
            "And returned on the previous night.",
        ]);
    });
    it("Should match with regex", () => {
        should(grep(text1, /in/i)).eql([
            "In a relative way"
        ]);
    });
});
