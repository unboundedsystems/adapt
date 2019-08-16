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

import Adapt, { Group } from "../src";
import { childrenToArray, isElement } from "../src/jsx";
import { Empty, MakeEmpty, MakeMakeEmpty } from "./testlib";

class Dummy extends Adapt.PrimitiveComponent { }

function checkChildKeys(element: Adapt.AdaptElement, refKeys: string[]) {
    if (element.props.children == null) {
        should(refKeys).eql([]);
        return;
    }

    const children = childrenToArray(element.props.children);
    let i = 0;
    for (const child of children) {
        if (isElement(child)) {
            should(child.props.key).equal(refKeys[i]);
            i++;
        }
    }
}

describe("DOM Key Assignment Tests", () => {
    it("Should assign key to root", async () => {
        const root = <Group />;
        const { contents: dom } = await Adapt.buildOnce(root, null);
        if (dom == null) {
            should(dom).not.Null();
            return;
        }
        should(dom.props.key).equal("Group");
    });

    it("Should assign keys to children by node type", async () => {
        const root =
            <Group>
                <Empty id={0} />
                <Empty id={1} />
                <Dummy />
                <Dummy />
                <Empty id={2} />
                <Dummy />
            </Group>;

        const { contents: dom } = await Adapt.buildOnce(root, null);

        if (dom == null) {
            should(dom).not.Null();
            return;
        }
        should(dom.props.key).equal("Group");
        const childKeys = ["Empty", "Empty1", "Dummy", "Dummy1", "Empty2", "Dummy2"];
        checkChildKeys(dom, childKeys);
    });

    it("Should only assign keys if not set by user", async () => {
        const root =
            <Group>
                <Empty id={0} />
                <Empty key="Hello" id={1} />
                <Empty id={2} />
            </Group>;

        const { contents: dom } = await Adapt.buildOnce(root, null);

        if (dom == null) {
            should(dom).not.Null();
            return;
        }
        should(dom.props.key).equal("Group");
        const childKeys = ["Empty", "Hello", "Empty1"];
        checkChildKeys(dom, childKeys);
    });

    it("Should propagate key on recursive build", async () => {
        const root =
            <Group>
                <MakeMakeEmpty id={0} />
                <MakeEmpty key="Hello" id={1} />
                <Empty id={2} />
            </Group>;

        const { contents: dom } = await Adapt.buildOnce(root, null);

        if (dom == null) {
            should(dom).not.Null();
            return;
        }
        should(dom.props.key).equal("Group");
        const childKeys = ["MakeMakeEmpty-MakeEmpty-Empty", "Hello-Empty", "Empty"];
        checkChildKeys(dom, childKeys);
    });
});
