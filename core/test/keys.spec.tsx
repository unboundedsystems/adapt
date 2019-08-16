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

import Adapt, { Group, } from "../src";
import {
    assignKeysAtPlacement,
    computeMountKey,
    isDefaultKey,
    KeyTracker,
} from "../src/keys";
import {
    componentConstructorDataFixture,
    Empty,
} from "./testlib";

describe("Assign Keys", () => {
    it("Should generate needed keys", () => {
        const tree = <Group>
            <Empty id={1} />
            <Empty id={2} />
        </Group>;

        assignKeysAtPlacement(tree.props.children);
        should(tree.props.children[0].props.key).equal("Empty");
        should(isDefaultKey(tree.props.children[0].props)).be.True();
        should(tree.props.children[1].props.key).equal("Empty1");
        should(isDefaultKey(tree.props.children[1].props)).be.True();
    });

    it("Should not overwrite keys", () => {
        const tree = <Group>
            <Empty key="userDef" id={1} />
            <Empty id={2} />
        </Group>;

        assignKeysAtPlacement(tree.props.children);
        should(tree.props.children[0].props.key).equal("userDef");
        should(isDefaultKey(tree.props.children[0].props)).be.False();
        should(tree.props.children[1].props.key).equal("Empty");
        should(isDefaultKey(tree.props.children[1].props)).be.True();
    });

    it("Should assign singleton child key", () => {
        const tree = <Group>
            <Empty id={2} />
        </Group>;

        assignKeysAtPlacement(tree.props.children);
        should(tree.props.children.props.key).equal("Empty");
    });

    it("Should assign key for anonymous SFCs", async () => {
        function makeAnon<T>(x: T) { return x; }
        // tslint:disable-next-line:variable-name
        const Foo = makeAnon(() => <Empty id={1} />);
        const tree = <Foo />;

        const newKey = computeMountKey(tree, []);
        should(newKey.key).equal("anonymous");
        should(isDefaultKey(newKey)).be.True();
    });
});

describe("KeyTracker", () => {

    componentConstructorDataFixture();

    it("Should generate unique keys for a base name", () => {
        const tracker = new KeyTracker();
        const comp = new Empty({ id: 1 });

        tracker.addKey(comp); // Depth 0
        tracker.lastKeyPath().should.equal("Empty");
        tracker.pathPush();
        tracker.addKey(comp); // Depth 1
        tracker.lastKeyPath().should.equal("Empty.Empty");
        tracker.addKey(comp); // Depth 1
        tracker.lastKeyPath().should.equal("Empty.Empty1");
        tracker.pathPop();

        tracker.addKey(comp); // Depth 0
        tracker.lastKeyPath().should.equal("Empty1");
        tracker.pathPush();
        tracker.addKey(comp); // Depth 1
        tracker.lastKeyPath().should.equal("Empty1.Empty");
    });
});
