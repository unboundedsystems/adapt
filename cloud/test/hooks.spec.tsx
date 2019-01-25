import Adapt, { BuiltinProps, useImperativeMethods } from "@usys/adapt";
import should from "should";
import { useAsync, useMethod } from "../src/hooks";

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

describe("useMethod hook tests", () => {
    it("Should return default and computed value", async () => {
        const val: number[] = [];
        function Test(props: Partial<BuiltinProps>) {
            useImperativeMethods(() => ({
                getVal: () => 10
            }));
            val.push(useMethod(props.handle!, 3, "getVal"));
            return null;
        }

        await Adapt.build(<Test />, null);
        should(val).eql([3, 10]);
    });

    it("Should forward extra arguments", async () => {
        const val: number[] = [];
        function Test(props: Partial<BuiltinProps>) {
            useImperativeMethods(() => ({
                add: (x: number, y: number) => x + y
            }));
            val.push(useMethod(props.handle!, 5, "add", 6, 5));
            return null;
        }

        await Adapt.build(<Test />, null);
        should(val).eql([5, 11]);
    });
});
