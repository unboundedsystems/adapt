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
import { ExpectT, IsSameT } from "type-ops";
import Adapt, { BuiltinProps, handle, Handle, Style } from "../../src";
import { notReplacedByStyle, useImperativeMethods, useMethod } from "../../src/hooks";
import { doBuild } from "../testlib";

interface Inst1 {
    value: string;
    func: () => "funcreturn";
    optfunc?: () => "optfuncreturn";
}

interface Inst2 {
    getVal?(): number;
    add?(x: number, y: number): number;
}

describe("useMethod - 2 parameters", () => {

    it("Should return type include undefined", () => {
        function tester(h: Handle<Inst1>) {
            const ret = useMethod(h, "func");

            // Compile-time type test
            true as ExpectT<IsSameT<typeof ret, "funcreturn" | undefined>, true>;
        }
        should(tester).be.ok();
    });

    it("Should allow null handle", () => {
        function tester(h: Handle<Inst1> | null) {
            const ret = useMethod(h, "func");

            // Compile-time type test
            true as ExpectT<IsSameT<typeof ret, "funcreturn" | undefined>, true>;
        }
        should(tester).be.ok();
    });

    it("Should allow calling optional instance function", () => {
        function tester(h: Handle<Inst1>) {
            const ret = useMethod(h, "optfunc");

            // Compile-time type test
            true as ExpectT<IsSameT<typeof ret, "optfuncreturn" | undefined>, true>;
        }
        should(tester).be.ok();
    });

    it("Should generic Handle return type any", () => {
        function tester(h: Handle) {
            const ret = useMethod(h, "somefunc");

            // Compile-time type test
            true as ExpectT<IsSameT<typeof ret, any>, true>;
        }
        should(tester).be.ok();
    });

    it("Should explicit type param return explict type or undefined", () => {
        function tester(h: Handle) {
            const ret = useMethod<"explicit">(h, "func");

            // Compile-time type test
            true as ExpectT<IsSameT<typeof ret, "explicit" | undefined>, true>;
        }
        should(tester).be.ok();
    });

    it("Should return undefined and computed value", async () => {
        const val: (number | undefined)[] = [];
        function Test(props: Partial<BuiltinProps>) {
            const hand: Handle<Inst2> = props.handle!;
            useImperativeMethods<Inst2>(() => ({
                getVal: () => 10
            }));
            val.push(useMethod(hand, "getVal"));
            return null;
        }

        await Adapt.build(<Test />, null);
        should(val).eql([undefined, 10]);
    });

    it("Should deal with generic handle without default", async () => {
        const val: (number | undefined)[] = [];
        function Test(props: Partial<BuiltinProps>) {
            const hand: Handle = props.handle!;
            useImperativeMethods<Inst2>(() => ({
                getVal: () => 10
            }));
            val.push(useMethod(hand, "getVal"));
            return null;
        }

        await Adapt.build(<Test />, null);
        should(val).eql([undefined, 10]);
    });
});

describe("useMethod - 3 parameters", () => {

    it("Should allow null handle", () => {
        function tester(h: Handle<Inst1> | null) {
            const ret = useMethod(h, "init", "func", 1, 2);

            // Compile-time type test
            true as ExpectT<IsSameT<typeof ret, "funcreturn" | "init">, true>;
        }
        should(tester).be.ok();
    });

    it("Should return type include default", () => {
        function tester(h: Handle<Inst1>) {
            const ret = useMethod(h, "init", "func");

            // Compile-time type test
            true as ExpectT<IsSameT<typeof ret, "funcreturn" | "init">, true>;
        }
        should(tester).be.ok();
    });

    it("Should generic Handle return type any", () => {
        function tester(h: Handle) {
            const ret = useMethod(h, "init", "somefunc", 1, 2);

            // Compile-time type test
            true as ExpectT<IsSameT<typeof ret, any>, true>;
        }
        should(tester).be.ok();
    });

    it("Should explicit type param return explict type", () => {
        function tester(h: Handle) {
            const ret = useMethod<"explicit" | "default">(h, "default", "somefunc", 1, 2);

            // Compile-time type test
            true as ExpectT<IsSameT<typeof ret, "explicit" | "default">, true>;
        }
        should(tester).be.ok();
    });

    it("Should return default and computed value", async () => {
        const val: number[] = [];
        function Test(props: Partial<BuiltinProps>) {
            const hand: Handle<Inst2> = props.handle!;
            useImperativeMethods<Inst2>(() => ({
                getVal: () => 10
            }));
            val.push(useMethod(hand, 3, "getVal"));
            return null;
        }

        await Adapt.build(<Test />, null);
        should(val).eql([3, 10]);
    });

    it("Should forward extra arguments", async () => {
        const val: number[] = [];
        function Test(props: Partial<BuiltinProps>) {
            const hand: Handle<Inst2> = props.handle!;
            useImperativeMethods<Inst2>(() => ({
                add: (x, y) => x + y
            }));
            val.push(useMethod(hand, 5, "add", 6, 5));
            return null;
        }

        await Adapt.build(<Test />, null);
        should(val).eql([5, 11]);
    });

    it("Should deal with generic handle with default", async () => {
        const val: number[] = [];
        function Test(props: Partial<BuiltinProps>) {
            const hand: Handle = props.handle!;
            useImperativeMethods<Inst2>(() => ({
                getVal: () => 10
            }));
            val.push(useMethod(hand, 3, "getVal"));
            return null;
        }

        await Adapt.build(<Test />, null);
        should(val).eql([3, 10]);
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
