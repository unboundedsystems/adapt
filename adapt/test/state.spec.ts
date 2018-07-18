import * as should from "should";

import * as state from "../src/state";

describe("State Object Tests", () => {
    let s: state.StateStore;

    beforeEach(() => {
        s = state.createStateStore();
    });

    it("Should retrieve only value set", () => {
        const ref = {};
        const key = ["foo", "bar"];
        const noKey = ["foo", "baz"];

        s.setElementState(key, ref);
        const val = s.elementState(key);
        const noVal = s.elementState(noKey);

        should(val).equal(ref); //===, not eql
        should(noVal).Undefined();
    });

    it("Should return undefined for unknown keys", () => {
        const val = s.elementState(["Hi!"]);
        should(val).Undefined();
    });

    it("Should return different values for different keys", () => {
        const ref1 = {};
        const ref2 = {};
        const key1 = ["foo", "bar"];
        const key2 = ["foo", "baz"];

        s.setElementState(key1, ref1);
        s.setElementState(key2, ref2);

        const val1 = s.elementState(key1);
        const val2 = s.elementState(key2);

        should(val1).equal(ref1);
        should(val1).not.equal(ref2);
        should(val2).equal(ref2);
        should(val2).not.equal(ref1);
    });
});
