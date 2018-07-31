// This file has some mock workflows that use this library to test
// interactions between features

import should = require("should");

import { readFileSync } from "fs";
import { resolve } from "path";

import Adapt, {
    AdaptElement,
    build,
    serializeDom,
} from "@usys/adapt";

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

    it("Should build without style", () => {
        const result = build(<Nodecellar />, null);
        checkDom(result.contents, "nodecellar_nostyle.xml");

        // Make sure there are 4 warning messages in the build
        result.messages.length.should.equal(4);
        for (const m of result.messages) {
            switch (true) {
                case /Component Container cannot be built/.test(m.content):
                case /Component Compute cannot be built/.test(m.content):
                case /Component DockerHost cannot be built/.test(m.content):
                    continue;
                default:
                    throw new Error(`build message not expected: ${m.content}`);
            }
        }
    });

    it("Should build local style", () => {
        const result = build(<Nodecellar />, localStyle);
        checkDom(result.contents, "nodecellar_local.xml");
        result.messages.length.should.equal(0);
    });

});
