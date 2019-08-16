/*
 * Copyright 2019 Unbounded Systems, LLC
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
import Adapt, {
    domDiff,
    Group,
} from "../src";
import {
    doBuild,
    Empty,
    MakeEmpty,
} from "./testlib";

describe("domDiff", () => {
    it("Should have no diff with no changes", async () => {
        const orig =
            <Group>
                <Empty id={0} />
                <Empty id={1} />
            </Group>;
        const { dom: oldDom } = await doBuild(orig);
        const { dom: newDom } = await doBuild(orig);
        const diff = domDiff(oldDom, newDom);

        should(diff.added).have.size(0);
        should(diff.deleted).have.size(0);
        should(diff.commonNew).have.size(3);
        should(diff.commonOld).have.size(3);

        should(diff.commonNew.has(newDom)).be.True();
        should(diff.commonNew.has(newDom.props.children[0])).be.True();
        should(diff.commonNew.has(newDom.props.children[1])).be.True();

        should(diff.commonOld.has(oldDom)).be.True();
        should(diff.commonOld.has(oldDom.props.children[0])).be.True();
        should(diff.commonOld.has(oldDom.props.children[1])).be.True();
    });

    it("Should diff null to non-null", async () => {
        const orig =
            <Group>
                <Empty id={0} />
                <Empty id={1} />
            </Group>;
        const { dom: newDom } = await doBuild(orig);
        const diff = domDiff(null, newDom);

        should(diff.added).have.size(3);
        should(diff.deleted).have.size(0);
        should(diff.commonNew).have.size(0);
        should(diff.commonOld).have.size(0);

        should(diff.added.has(newDom)).be.True();
        should(diff.added.has(newDom.props.children[0])).be.True();
        should(diff.added.has(newDom.props.children[1])).be.True();
    });

    it("Should diff non-null to null", async () => {
        const orig =
            <Group>
                <Empty id={0} />
                <Empty id={1} />
            </Group>;
        const { dom: oldDom } = await doBuild(orig);
        const diff = domDiff(oldDom, null);

        should(diff.added).have.size(0);
        should(diff.deleted).have.size(3);
        should(diff.commonNew).have.size(0);
        should(diff.commonOld).have.size(0);

        should(diff.deleted.has(oldDom)).be.True();
        should(diff.deleted.has(oldDom.props.children[0])).be.True();
        should(diff.deleted.has(oldDom.props.children[1])).be.True();
    });

    it("Should handle changed namespaces", async () => {
        const origOld =
            <Group>
                <Empty id={0} />
                <Empty id={1} />
            </Group>;
        const origNew =
            <Group>
                <MakeEmpty id={0} />
                <MakeEmpty id={1} />
            </Group>;
        const { dom: oldDom } = await doBuild(origOld);
        const { dom: newDom } = await doBuild(origNew);
        const diff = domDiff(oldDom, newDom);

        should(diff.added).have.size(2);
        should(diff.deleted).have.size(2);
        should(diff.commonNew).have.size(1);
        should(diff.commonOld).have.size(1);

        should(diff.added.has(newDom.props.children[0])).be.True();
        should(diff.added.has(newDom.props.children[1])).be.True();
        should(diff.deleted.has(oldDom.props.children[0])).be.True();
        should(diff.deleted.has(oldDom.props.children[1])).be.True();

        should(diff.commonNew.has(newDom)).be.True();
        should(diff.commonOld.has(oldDom)).be.True();
    });
});
