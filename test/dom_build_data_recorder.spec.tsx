import * as should from "should";
import * as unbs from "../src";

// tslint:disable-next-line:no-duplicate-imports
import {
    build as unbsBuild,
    BuildOp,
} from "../src";

import {
    Empty
} from "./testlib";

describe("Build Data Recorder", () => {
    let record: BuildOp[];
    beforeEach(() => {
        record = [];
    });

    function recorder(op: BuildOp) {
        record.push(op);
    }

    it("should start", () => {
        const dom = <Empty id={1} />;
        unbsBuild(dom, null, { recorder });
        should(record[0]).eql({ type: "start", root: dom });
    });

    it("should record step, elementBuilt", () => {
        const dom = <Empty id={1} />;
        const newElem = unbsBuild(dom, null, { recorder });
        const record1 = record[1];
        const record2 = record[2];
        if (record1.type === "step") {
            should(record1).eql({ type: "step", oldElem: dom, newElem, style: undefined });
            should(record2).eql({
                type: "elementBuilt",
                oldElem: dom,
                newElem: record1.newElem
            });
        } else {
            should(record1.type).equal("step");
        }
    });
});
