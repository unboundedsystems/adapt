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

});
