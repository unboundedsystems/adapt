//import { mochaTmpdir } from "@usys/testutils";
import Adapt from "@usys/adapt";
import should from "should";
import { useAsync } from "../src/LocalTypescriptBuild";

//FIXME(manishv) Move to a dedicate file for useAsync
describe("useAsync hook tests", () => {
    it("Should return default and computed value", async () => {
        const val: number[] = [];
        function Test(_props: {}) {
            val.push(useAsync(async () => 10, 3));
            return null;
        }

        await Adapt.build(<Test/>, null);
        should(val).eql([3, 10]);
    });
});
