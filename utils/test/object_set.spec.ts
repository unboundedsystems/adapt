/*
 * Copyright 2018 Unbounded Systems, LLC
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

import { ObjectSet } from "../src/object_set";

interface TestObj {
    id: number;
    a?: string;
    b?: string;
}

describe("ObjectSet", () => {
    it("Should add and iterate objects", () => {
        const s = new ObjectSet<TestObj>();

        s.add({id: 0});
        s.add({id: 1});
        s.add({id: 2});

        should(s.length).equal(3);

        let count = 0;
        for (const val of s) {
            should(val).eql({ id: count++ });
        }
    });

    it("Should construct with array", () => {
        const s = new ObjectSet<TestObj>([
            {id: 0},
            {id: 1},
            {id: 2},
        ]);

        should(s.length).equal(3);

        let count = 0;
        for (const val of s) {
            should(val).eql({ id: count++ });
        }
    });

    it("Should construct with Set", () => {
        const s = new ObjectSet<TestObj>(new Set([
            {id: 0},
            {id: 1},
            {id: 2},
        ]));

        should(s.length).equal(3);

        let count = 0;
        for (const val of s) {
            should(val).eql({ id: count++ });
        }
    });

    it("Should add with defaults", () => {
        const s = new ObjectSet<TestObj>(undefined, {b: "default"});

        s.add({id: 0});
        s.add({id: 1, b: "one"});
        s.add({id: 2});

        should(s.length).equal(3);

        let count = 0;
        for (const val of s) {
            const b = count === 1 ? "one" : "default";
            should(val).eql({ id: count++, b });
        }
    });

    it("Should construct with defaults", () => {
        const s = new ObjectSet<TestObj>([
            {id: 0},
            {id: 1, b: "one"},
            {id: 2},
        ], {b: "default"});

        should(s.length).equal(3);

        let count = 0;
        for (const val of s) {
            const b = count === 1 ? "one" : "default";
            should(val).eql({ id: count++, b });
        }
    });

    it("Should add equivalent objects once", () => {
        const s = new ObjectSet<TestObj>();
        const a = {id: 0, a: "a", b: "b"};
        const b = {id: 0, a: "a", b: "b"};
        const c = {a: "a", id: 0, b: "b"};

        s.add(a);
        s.add(b);
        s.add(c);

        should(s.length).equal(1);

        for (const val of s) {
            should(val).eql(a);
        }
    });

});
