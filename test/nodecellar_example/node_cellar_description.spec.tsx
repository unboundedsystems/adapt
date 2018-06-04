// This file has some mock workflows that use this library to test
// interactions between features

import should = require("should");

import { readFileSync } from "fs";
import * as ld from "lodash";
import { resolve } from "path";

import unbs, {
    build,
    BuildOutput,
    isPrimitiveElement,
    Message,
    serializeDom,
    UnbsElement,
    UnbsNode,
} from "../../src";
import LocalStyle from "./LocalStyle";
import Nodecellar from "./Nodecellar";

interface BuildState {
    dom: UnbsNode;
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
            out.contents.updateState(state);
        }
    } while (!ld.isEqual(oldState, state));
    return {
        dom: out.contents,
        state,
        messages
     };
}

const outputDir = `${__dirname}/output`.replace(/\/dist/, "");

function checkDom(dom: UnbsElement | null, xmlFilename: string) {
    should(dom).not.be.Null();
    if (dom == null) {
        throw new Error(`Dom is null when comparing to '${xmlFilename}.`);
    }
    const golden = readFileSync(resolve(`${outputDir}/${xmlFilename}`));
    serializeDom(dom).trim().should.eql(golden.toString().trim());
}

describe("NodeCellar", () => {

    it("Should build without style", () => {
        const result = buildLoop({}, <Nodecellar />);
        checkDom(result.dom, "nodecellar_nostyle.xml");

        // Make sure there are two warning messages in the build
        result.messages.length.should.equal(2);
        for (const m of result.messages) {
            should(/Component Container is abstract/.test(m.content)).be.True();
        }
    });

    it("Should build local style", () => {
        const result = buildLoop({}, <Nodecellar />, LocalStyle);
        // tslint:disable-next-line:no-console
        console.log(result.dom);
        checkDom(result.dom, "nodecellar_local.xml");
        result.messages.length.should.equal(0);
    });
});
