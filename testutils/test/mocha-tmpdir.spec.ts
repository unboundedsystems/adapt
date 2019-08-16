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

import * as fs from "fs-extra";
import * as os from "os";
import expect from "should";

import * as mochaTmpdir from "../src/mocha-tmpdir";

function getTmpdirList(matcher: RegExp) {
    const filelist = fs.readdirSync(os.tmpdir());
    return new Set(filelist.filter((name) => matcher.test(name)));
}

describe("Mocha-tmpdir each", () => {
    const prefix = "adapt-utils-test-tmpdir";
    const prefixRe = RegExp(prefix);
    const startingSet = getTmpdirList(prefixRe);
    const previous = new Set<string>();

    mochaTmpdir.each(prefix);

    it("Should create a temp directory", () => {
        const cwd = process.cwd();

        expect(cwd).startWith(os.tmpdir());
        expect(startingSet.has(cwd)).equals(false);
        previous.add(cwd);
    });

    it("Should delete the last dir and create new", async () => {
        const cwd = process.cwd();

        expect(cwd).startWith(os.tmpdir());
        expect(startingSet.has(cwd)).equals(false);
        expect(previous.has(cwd)).equals(false);

        const currentSet = getTmpdirList(prefixRe);
        previous.forEach((name) => {
            expect(currentSet.has(name)).equals(false);
        });

        previous.add(cwd);
    });
});
