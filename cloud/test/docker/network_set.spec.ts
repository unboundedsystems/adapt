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
import { InspectReport } from "../../src/docker/cli";
import { containerNetworks, mightBeId, NetworkInfo, NetworkResolver } from "../../src/docker/network_set";

function fakeReport(nets: NetworkInfo[]): InspectReport {
    // tslint:disable-next-line: variable-name
    const Networks: any = {};
    const report: any = {
        NetworkSettings: {
            Networks
        }
    };
    for (const n of nets) {
        Networks[n.name] = {
            NetworkID: n.id || ""
        };
    }
    return report;
}

function setup1() {
    const report = fakeReport([
        { name: "one" },
        { name: "two", id: "abcd1234" },
    ]);

    const set = containerNetworks(report);
    should(set.size).equal(2);
    return set;
}

function setup2() {
    const report = fakeReport([
        { name: "one", id: "2345" },
        { name: "two", id: "abcd1234" },
    ]);

    const set = containerNetworks(report);
    should(set.size).equal(2);
    return set;
}

const noResolve: NetworkResolver = async (_names) => {
    throw new Error(`Should not call resolver`);
};

const resolveWith = (expect: string[], response: Required<NetworkInfo>[]): NetworkResolver =>
    async (actual) => {
        should(actual).eql(expect);
        return response;
    };

describe("NetworkSet", () => {
    it("Should create a set and support basic operations", () => {
        const set = setup1();

        should(set.allResolved).equal(false);
        should(set._get("one")).eql({ name: "one" });
        const two = set._get("two");
        should(two).eql({ name: "two", id: "abcd1234" });
        should(set._get("abcd1234")).equal(two);
    });

    it("Should diff deletes", async () => {
        const set = setup1();

        const diff = await set.diff([], noResolve);
        should(diff.toAdd).eql([]);
        should(diff.toDelete).eql([ "one", "two" ]);
    });

    it("Should diff adds", async () => {
        const set = setup1();

        const diff = await set.diff([ "one", "two", "three", "four" ], noResolve);
        should(diff.toAdd).eql([ "three", "four" ]);
        should(diff.toDelete).eql([]);
    });

    it("Should diff no change", async () => {
        const set = setup1();

        const diff = await set.diff([ "one", "two" ], noResolve);
        should(diff.toAdd).eql([]);
        should(diff.toDelete).eql([]);
    });

    it("Should diff no change with id", async () => {
        const set = setup1();

        const diff = await set.diff([ "one", "abcd1234" ], noResolve);
        should(diff.toAdd).eql([]);
        should(diff.toDelete).eql([]);
    });

    it("Should diff mixed", async () => {
        const set = setup1();

        const diff = await set.diff([ "one", "three", "four" ], noResolve);
        should(diff.toAdd).eql([ "three", "four" ]);
        should(diff.toDelete).eql([ "two" ]);
    });

    it("Should not request resolve if all networks resolved", async () => {
        const set = setup2();

        const diff = await set.diff([ "abc", "def", "2345" ], noResolve);
        should(diff.toAdd).eql([ "abc", "def" ]);
        should(diff.toDelete).eql([ "two" ]);
    });

    it("Should request resolve", async () => {
        const resolver = resolveWith(["one"], [{ name: "one", id: "def" }]);
        const set = setup1();

        const diff = await set.diff([ "abc", "def", "2345" ], resolver);
        should(diff.toAdd).eql([ "abc", "2345" ]);
        should(diff.toDelete).eql([ "two" ]);
    });

    it("Should error on unresolved", async () => {
        const resolver = resolveWith(["one"], []);
        const set = setup1();

        await should(set.diff([ "abc", "def", "2345" ], resolver))
            .be.rejectedWith(/Resolution failed for Docker networks: one/);
    });

    it("Should not request resolve on equals with size > len", async () => {
        const set = setup1();

        const ret = await set.equals([ "abc" ], noResolve);
        should(ret).be.False();
    });

    it("Should not request resolve on equals with no unresolved", async () => {
        const set = setup2();

        const ret = await set.equals([ "abc" ], noResolve);
        should(ret).be.False();
    });
});

describe("mightBeId", () => {
    it("Should valid chars possibly be an ID", () => {
        should(mightBeId("abc123")).be.True();
        should(mightBeId("a")).be.True();
        should(mightBeId("2")).be.True();
        should(mightBeId("abcdef0123456789")).be.True();
        should(mightBeId("0".repeat(64))).be.True();
    });

    it("Should > 64 chars not be an ID", () => {
        should(mightBeId("0".repeat(65))).be.False();
        should(mightBeId("0".repeat(100))).be.False();
    });

    it("Should invalid chars not be an ID", () => {
        should(mightBeId("Abc123")).be.False();
        should(mightBeId(".")).be.False();
        should(mightBeId(":")).be.False();
        should(mightBeId("g")).be.False();
        should(mightBeId("F")).be.False();
    });
});
