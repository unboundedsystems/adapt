import Adapt, {
    Group,
    isHandle,
    PrimitiveComponent,
    useImperativeMethods
} from "@adpt/core";
import should from "should";
import {
    handles,
} from "../src/handles";
import { doBuild } from "./testlib";

class Dummy extends PrimitiveComponent { }

describe("Handles Tests", async () => {
    it("Should start with no handles", async () => {
        function Test() {
            const h = handles();
            should(h.test).Undefined();
            return <Dummy />;
        }
        await doBuild(<Test />);
    });

    it("Should create handle", async () => {
        function Test() {
            const h = handles();
            const testHandle = h.create.test;
            should(testHandle).not.Undefined();
            should(h.test).not.Undefined();
            const elem = <Group handle={testHandle} />;
            should(testHandle).equal(h.test);
            should(isHandle(h.test)).True();
            should(isHandle(testHandle)).True();

            should(testHandle.origTarget).equal(elem);
            should(h.test.origTarget).equal(elem);
            return <Dummy />;
        }
        await doBuild(<Test />);
    });

    it("Should proxy handle methods", async () => {
        function Test() {
            const h = handles();
            const testHandle = h.create.test;

            const elem = <Group handle={testHandle} />;
            should(testHandle.origTarget).equal(elem);
            should(h.test.origTarget).equal(elem);
            return <Dummy />;
        }
        await doBuild(<Test />);
    });

    it("Should forward method calls to instance", async () => {
        const vals: any[] = [];
        function Fixture() {
            useImperativeMethods(() => ({
                method: () => 1
            }));
            return <Dummy />;
        }

        function Test() {
            const h = handles();
            const ret = <Fixture handle={h.create.test} />;
            vals.push(h.test.method());
            return ret;
        }

        await doBuild(<Test />);
        should(vals).eql([undefined, 1]);
    });

    it("Should select default values from instance", async () => {
        const vals: any[] = [];
        function Fixture() {
            useImperativeMethods(() => ({
                method: () => 1
            }));
            return <Dummy />;
        }
        (Fixture as any).defaults = { method: -1 };

        function Test() {
            const h = handles();
            const ret = <Fixture handle={h.create.test} />;
            vals.push(h.test.method());
            return ret;
        }

        await doBuild(<Test />);
        should(vals).eql([-1, 1]);
    });
});
