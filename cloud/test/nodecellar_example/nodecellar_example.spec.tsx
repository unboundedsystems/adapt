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

// This file has some mock workflows that use this library to test
// interactions between features

import should = require("should");

import { readFileSync } from "fs";
import { resolve } from "path";

import Adapt, {
    AdaptElement,
    build,
    serializeDom,
} from "@adpt/core";

import localStyle from "./localStyle";
import Nodecellar from "./Nodecellar";

const outputDir = `${__dirname}/results`.replace(/\/dist/, "");

function checkDom(dom: AdaptElement | null, xmlFilename: string) {
    should(dom).not.be.Null();
    if (dom == null) {
        throw new Error(`Dom is null when comparing to '${xmlFilename}.`);
    }
    const golden = readFileSync(resolve(`${outputDir}/${xmlFilename}`));
    serializeDom(dom).trim().should.eql(golden.toString().trim());
}

describe("NodeCellar", () => {

    it("Should build without style", async () => {
        const result = await build(<Nodecellar />, null);
        checkDom(result.contents, "nodecellar_nostyle.xml");

        // Make sure there are 4 warning messages in the build
        result.messages.length.should.equal(1);
        for (const m of result.messages) {
            switch (true) {
                case /Component Compute cannot be built/.test(m.content):
                    continue;
                default:
                    throw new Error(`build message not expected: ${m.content}`);
            }
        }
    });

    it("Should build local style", async () => {
        const result = await build(<Nodecellar />, localStyle);
        checkDom(result.contents, "nodecellar_local.xml");
        result.messages.length.should.equal(0);
    });

});
