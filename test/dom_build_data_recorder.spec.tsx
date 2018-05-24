import * as should from "should";
import * as unbs from "../src";

// tslint:disable-next-line:no-duplicate-imports
import {
    build as unbsBuild,
    BuildOp,
    BuildOpStep
} from "../src";

import {
    Empty,
    MakeEmpty
} from "./testlib";

describe("Build Data Recorder", () => {
    let record: BuildOp[];
    beforeEach(() => {
        record = [];
    });

    function recorder(op: BuildOp) {
        record.push(op);
    }

    function matchRecord(ref: BuildOp[]) {
        should(record).eql(ref);
    }

    it("should start", () => {
        const dom = <Empty id={1} />;
        unbsBuild(dom, null, { recorder });
        should(record[0]).deepEqual({ type: "start", root: dom });
    });

    it("should record step, elementBuilt", () => {
        const dom = <Empty id={1} />;
        const newElem = unbsBuild(dom, null, { recorder });
        matchRecord([
            { type: "start", root: dom },
            { type: "elementBuilt", oldElem: dom, newElem },
            { type: "done", root: newElem }
        ]);
    });

    it("should record step, step, elementBuild", () => {
        const dom = <MakeEmpty id={1} />;
        const newElem = unbsBuild(dom, null, { recorder });
        const record1Out = (record[1] as BuildOpStep).newElem;
        matchRecord([
            { type: "start", root: dom },
            {
                type: "step",
                oldElem: dom,
                newElem: record1Out,
                style: undefined
            },
            { type: "elementBuilt", oldElem: dom, newElem },
            { type: "done", root: newElem }
        ]);

    });
});
