import * as should from "should";
import * as unbs from "../src";

// tslint:disable-next-line:no-duplicate-imports
import {
    build as unbsBuild,
    BuildOp,
    BuildOpStep,
    Group
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

    function matchRecord(lrec: BuildOp[], ref: BuildOp[]) {
        should(lrec).eql(ref);
    }

    it("should start", () => {
        const dom = <Empty id={1} />;
        unbsBuild(dom, null, { recorder });
        should(record[0]).deepEqual({ type: "start", root: dom });
    });

    it("should record step, elementBuilt", () => {
        const dom = <Empty id={1} />;
        const newElem = unbsBuild(dom, null, { recorder });
        matchRecord(record, [
            { type: "start", root: dom },
            { type: "elementBuilt", oldElem: dom, newElem },
            { type: "done", root: newElem }
        ]);
    });

    it("should record step, step, elementBuild", () => {
        const dom = <MakeEmpty id={1} />;
        const newElem = unbsBuild(dom, null, { recorder });
        const record1Out = (record[1] as BuildOpStep).newElem;
        matchRecord(record, [
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

    it("should record ascend, descend", () => {
        const empty1 = <Empty id={1} />;
        const empty2 = <Empty id={2} />;
        const layer1 = <Group>{empty1}{empty2}</Group>;
        const dom = <Group>{layer1}</Group>;

        const newDom = unbsBuild(dom, null, { recorder });

        if (newDom == null) {
            should(newDom).not.Null();
            return;
        }

        const filtered = record.filter((op) => (op.type === "descend") || (op.type === "ascend"));
        matchRecord(filtered,
            [
                { type: "descend", descendFrom: dom, descendTo: layer1 },
                { type: "descend", descendFrom: layer1, descendTo: empty1 },
                { type: "ascend", ascendFrom: empty1, ascendTo: layer1 },
                { type: "descend", descendFrom: layer1, descendTo: empty2 },
                { type: "ascend", ascendFrom: empty2, ascendTo: layer1 },
                { type: "ascend", ascendFrom: layer1, ascendTo: newDom }
            ]);
    });
});
