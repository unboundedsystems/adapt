import should from "should";
import Adapt from "../../src";
import { useAsync } from "../../src/hooks";

describe("useAsync hook tests", () => {
    it("Should return default and computed value", async () => {
        const val: number[] = [];
        function Test(_props: {}) {
            val.push(useAsync(async () => 10, 3));
            return null;
        }

        await Adapt.build(<Test />, null);
        should(val).eql([3, 10]);
    });
});
