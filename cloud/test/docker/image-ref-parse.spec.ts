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

import should from "should";
import { ImagePart, match, parseReference } from "../../src/docker/image-ref-parse";

const imageSha1 = "sha256:6858809bf669cc5da7cb6af83d0fae838284d12e1be0182f92f6bd96559873e3";

function check(part: ImagePart, input: string, matches: boolean | string[]) {
    const toMatch = (i: any) => i ? "match" : "not match";
    const m = match(part, input);
    should(toMatch(m)).equal(toMatch(matches),
        `Expected '${input}' to ${toMatch(matches)}`);
}

describe("Image ref parsing", () => {
    it("Should parse references", () => {
        should(parseReference("test/one/two")).eql({
            name: "test/one/two",
            tag: undefined,
            digest: undefined,
        });
        should(parseReference("test.ref.com/one/two:some.tag")).eql({
            name: "test.ref.com/one/two",
            tag: "some.tag",
            digest: undefined,
        });
        should(parseReference(`test.ref.com:543212/one/two:some.tag@${imageSha1}`)).eql({
            name: "test.ref.com:543212/one/two",
            tag: "some.tag",
            digest: imageSha1,
        });
    });

    it("Should parse paths", () => {
        check("path", "one", true);
        check("path", "One", false);
        check("path", "one/", false);
        check("path", "/one", false);
        check("path", "one/two/", false);
        check("path", "one/two/three/four/five", true);
        check("path", "one.two/three-four", true);
        check("path", "one./three-four", false);
        check("path", "one..two/three-four", false);
        check("path", "one----two/three-four", true);
        check("path", "one_two/three-four", true);
        check("path", "one__two/three-four", true);
        check("path", "one___two/three-four", false);
    });
});
