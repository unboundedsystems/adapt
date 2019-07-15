import should from "should";
import Adapt, { BuiltinProps, handle, Style } from "../../src";
import { notReplacedByStyle, useImperativeMethods, useMethod } from "../../src/hooks";
import { doBuild } from "../testlib";

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

describe("notReplacedByStyle", () => {
    it("Should return instance of first built element in style chain", async () => {
        //FIXME(manishv)  This is a hack to allow style sheets to provide reasonable semantics
        //under current operation. We need to reevaluate the sematnics of a style sheet and
        //implement those better semantics.  This behavior can then fall where it may.
        const hand = handle();
        function ReplaceMe1() { return null; }
        function ReplaceMe2() { return null; }
        const inst = { field: "Hi there!" };
        function Final() {
            useImperativeMethods(() => inst);
            return null;
        }
        const root = <ReplaceMe1 handle={hand} />;
        const style = <Style>
            {ReplaceMe1} {Adapt.rule(() => <ReplaceMe2 />)}
            {ReplaceMe2} {Adapt.rule(() => <Final />)}
        </Style>;
        await doBuild(root, { style, nullDomOk: true });
        if (hand.mountedOrig === null) throw should(hand.mountedOrig).not.Null();
        if (hand.mountedOrig === undefined) throw should(hand.mountedOrig).not.Undefined();
        const el = hand.nextMounted(notReplacedByStyle());
        if (el === null) throw should(el).not.be.Null();
        if (el === undefined) throw should(el).not.be.Undefined();
        should(el.instance).eql(inst);
    });
});
