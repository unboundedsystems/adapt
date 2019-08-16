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

import should from "should";
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
        should(record[0]).deepEqual({ type: "start", root: dom, buildPass: 1 });
    });

    it("should record step, elementBuilt", async () => {
        const dom = <Empty id={1} />;
        const { contents: newElem } = await adaptBuild(dom, null, { recorder });
        matchRecord(record, [
            { type: "start", root: dom, buildPass: 1 },
            { type: "defer", elem: cloneElement(dom, { key: "Empty" }) },
            { type: "buildDeferred", elem: cloneElement(dom, { key: "Empty" }) },
            { type: "elementBuilt", oldElem: dom, newElem },
            { type: "done", root: newElem }
        ]);
    });

    it("should record step, step, elementBuilt", async () => {
        const dom = <MakeEmpty id={1} />;
        const { contents: newElem } = await adaptBuild(dom, null, { recorder });
        const record1Out = (record[1] as BuildOpStep).newElem;
        if (!record1Out) throw should(record1Out).be.ok();
        matchRecord(record, [
            { type: "start", root: dom, buildPass: 1 },
            {
                type: "step",
                oldElem: cloneElement(dom, { key: "MakeEmpty" }),
                newElem: record1Out,
            },
            { type: "defer", elem: cloneElement(record1Out, { key: "MakeEmpty-Empty" }) },
            { type: "buildDeferred", elem: cloneElement(record1Out, { key: "MakeEmpty-Empty" }) },
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
