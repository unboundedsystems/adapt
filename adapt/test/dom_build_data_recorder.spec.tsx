import * as should from "should";
import * as Adapt from "../src";

// tslint:disable-next-line:no-duplicate-imports
import {
    buildOnce as adaptBuild,
    BuildOp,
    BuildOpStep,
    cloneElement,
    Group
} from "../src";

import {
    deepFilterElemsToPublic,
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
        should(deepFilterElemsToPublic(lrec)).eql(deepFilterElemsToPublic(ref));
    }

    it("should start", async () => {
        const dom = <Empty id={1} />;
        await adaptBuild(dom, null, { recorder });
        should(record[0]).deepEqual({ type: "start", root: dom });
    });

    it("should record step, elementBuilt", async () => {
        const dom = <Empty id={1} />;
        const { contents: newElem } = await adaptBuild(dom, null, { recorder });
        matchRecord(record, [
            { type: "start", root: dom },
            { type: "elementBuilt", oldElem: dom, newElem },
            { type: "done", root: newElem }
        ]);
    });

    it("should record step, step, elementBuilt", async () => {
        const dom = <MakeEmpty id={1} />;
        const { contents: newElem } = await adaptBuild(dom, null, { recorder });
        const record1Out = (record[1] as BuildOpStep).newElem;
        matchRecord(record, [
            { type: "start", root: dom },
            {
                type: "step",
                oldElem: cloneElement(dom, { key: "MakeEmpty" }),
                newElem: record1Out,
            },
            { type: "elementBuilt", oldElem: dom, newElem },
            { type: "done", root: newElem }
        ]);
    });

    it("should record ascend, descend", async () => {
        const empty1 = <Empty key="empty1" id={1} />;
        const empty2 = <Empty key="empty2" id={2} />;
        const layer1 = <Group key="layer1">{empty1}{empty2}</Group>;
        const dom = <Group key="root">{layer1}</Group>;

        const { contents: newDom } = await adaptBuild(dom, null, { recorder });

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
