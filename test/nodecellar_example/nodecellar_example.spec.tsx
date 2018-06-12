// This file has some mock workflows that use this library to test
// interactions between features

import should = require("should");

import { readFileSync } from "fs";
import * as ld from "lodash";
import { resolve } from "path";

import unbs, {
    build,
    BuildOutput,
    concatStyles,
    isPrimitiveElement,
    Message,
    serializeDom,
    UnbsElement,
    UnbsElementOrNull,
    UpdateStateInfo,
} from "../../src";

import awsStyle from "./awsStyle";
import cloudifyStyle from "./cloudifyStyle";
import localStyle from "./localStyle";
import Nodecellar from "./Nodecellar";

interface BuildState {
    dom: UnbsElementOrNull;
    state: any;
    messages: Message[];
}
function buildLoop(initialState: any, root: UnbsElement, styles?: UnbsElement): BuildState {
    let state = ld.cloneDeep(initialState);
    let oldState = ld.cloneDeep(state);
    let out: BuildOutput;
    const messages: Message[] = [];
    do {
        const newRoot = unbs.cloneElement(root, { store: state });
        out = build(newRoot, styles || null);
        // tslint:disable-next-line:no-console
        console.log("******************");
        for (const m of out.messages) {
            // tslint:disable-next-line:no-console
            console.log(`${m.type}: ${m.content}`);
        }
        messages.push(...out.messages);
        if (out.contents != null) {
            // tslint:disable-next-line:no-console
            console.log(serializeDom(out.contents));
        } else {
            // tslint:disable-next-line:no-console
            console.log("null");
        }
        oldState = state;
        state = ld.cloneDeep(initialState);
        if ((out.contents != null) && isPrimitiveElement(out.contents)) {
            const info = new UpdateStateInfo();
            out.contents.updateState(state, info);
            // tslint:disable-next-line:no-console
            console.log("\n\nState:\n" + JSON.stringify(state, null, 2));
        }
    } while (!ld.isEqual(oldState, state));
    return {
        dom: out.contents,
        state,
        messages
     };
}

const outputDir = `${__dirname}/results`.replace(/\/dist/, "");

function checkDom(dom: UnbsElement | null, xmlFilename: string) {
    should(dom).not.be.Null();
    if (dom == null) {
        throw new Error(`Dom is null when comparing to '${xmlFilename}.`);
    }
    const golden = readFileSync(resolve(`${outputDir}/${xmlFilename}`));
    serializeDom(dom).trim().should.eql(golden.toString().trim());
}

describe("NodeCellar", () => {

    it("Should build without style", function() {
        // tslint:disable-next-line:no-console
        console.log("TEST: ", this.test.title);
        const result = buildLoop({}, <Nodecellar />);
        checkDom(result.dom, "nodecellar_nostyle.xml");

        // Make sure there are two warning messages in the build
        result.messages.length.should.equal(4);
        for (const m of result.messages) {
            switch (true) {
                case /Component Container is abstract/.test(m.content):
                case /Component Compute is abstract/.test(m.content):
                case /Component DockerHost cannot be built/.test(m.content):
                    continue;
                default:
                    throw new Error(`build message not expected: ${m.content}`);
            }
        }
    });

    it("Should build local style", function() {
        // tslint:disable-next-line:no-console
        console.log("TEST: ", this.test.title);

        const result = buildLoop({}, <Nodecellar />, localStyle);
        checkDom(result.dom, "nodecellar_local.xml");
        result.messages.length.should.equal(0);
    });

    it("Should build AWS style", function() {
        // tslint:disable-next-line:no-console
        console.log("TEST: ", this.test.title);

        const result = buildLoop({}, <Nodecellar />, awsStyle);
        checkDom(result.dom, "nodecellar_aws.xml");
        result.messages.length.should.equal(0);
    });

    it("Should build local, deploy=cloudify", function() {
        // tslint:disable-next-line:no-console
        console.log("TEST: ", this.test.title);

        const style = concatStyles(localStyle, cloudifyStyle);

        const result = buildLoop({}, <Nodecellar />, style);
        checkDom(result.dom, "nodecellar_cfylocal.xml");
        result.messages.length.should.equal(0);
    });
});
