import * as should from "should";

import * as state from "../src/state";

describe("State Store Tests", () => {
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

    it("Should delete elements when set to undefined", () => {
        const ref = {};
        const key = ["foo", "bar"];

        s.setElementState(key, ref);
        const val = s.elementState(key);
        should(val).equal(ref); //===, not eql

        s.setElementState(key, undefined);
        const noVal = s.elementState(key);
        should(noVal).Undefined();
    });

    it("Should serialize and deserialize", () => {
        const ref1 = { val1: "data1" };
        const ref2 = { val2: "data2" };
        const key1 = ["foo", "bar"];
        const key2 = ["foo", "baz"];

        s.setElementState(key1, ref1);
        s.setElementState(key2, ref2);

        const serialized = s.serialize();
        const deserialized = state.createStateStore(serialized);

        const val1 = deserialized.elementState(key1);
        const val2 = deserialized.elementState(key2);

        should(val1).eql(ref1);
        should(val2).eql(ref2);
    });
});
