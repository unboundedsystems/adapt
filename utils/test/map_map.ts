import * as should from "should";

import { mapMap } from "../src/map_map";

describe("mapMap", () => {
    it("Should do basic mapping to an array", () => {
        const m = new Map();
        m.set("a", 1);
        m.set("b", 2);

        const arr = mapMap(m, (k, v) => [k, v]);
        should(arr).eql([
            ["a", 1],
            ["b", 2],
        ]);
    });

    it("Should not call function on empty Map", () => {
        const m = new Map();
        const arr = mapMap(m, (_k, _v) => {
            throw new Error(`Should not happen`);
        });
        should(arr).eql([]);
    });
});
