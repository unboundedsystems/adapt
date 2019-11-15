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
import Adapt, {
    BuiltinProps,
    callFirstInstanceWithMethod,
    callInstanceMethod,
    callNextInstanceWithMethod,
    Group,
    handle,
    Handle,
    Style,
    useImperativeMethods,
    useMethod,
} from "../../src";
import { notReplacedByStyle } from "../../src/hooks";
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

describe("callInstanceMethod family", () => {
    /*
     * Instance methods:
     *  all: Implemented by all components
     *  none: Implemented by no components
     *  only*: Implemented by only the named component
     */
    function ReplaceMe1() {
        useImperativeMethods(() => ({
            all: () => "ReplaceMe1",
            onlyReplaceMe1: () => "ReplaceMe1",
        }));
        return null;
    }
    function ReplaceMe2() {
        useImperativeMethods(() => ({
            all: () => "ReplaceMe2",
            onlyReplaceMe2: () => "ReplaceMe2",
        }));
        return null;
    }
    function Build1() {
        useImperativeMethods(() => ({
            all: () => "Build1",
            onlyBuild1: () => "Build1",
        }));
        return <Build2 />;
    }
    function Build2() {
        useImperativeMethods(() => ({
            all: () => "Build2",
            onlyBuild2: () => "Build2",
        }));
        return <Final />;
    }
    function Final() {
        useImperativeMethods(() => ({
            all: () => "Final",
            onlyFinal: () => "Final",
        }));
        return null;
    }
    function ReplaceNull() {
        useImperativeMethods(() => ({
            all: () => "ReplaceNull",
            onlyReplaceNull: () => "ReplaceNull",
        }));
        return null;
    }

    let hFirst: Handle;
    let hSecond: Handle;
    let hThird: Handle;

    before(async () => {
        hFirst = handle();
        hSecond = handle();
        hThird = handle();
        const root =
            <Group>
                <ReplaceMe1 handle={hFirst} />
                <ReplaceNull handle={hSecond} />
                <Build1 handle={hThird} />
            </Group>;
        const style = <Style>
            {ReplaceMe1} {Adapt.rule(() => <ReplaceMe2 />)}
            {ReplaceMe2} {Adapt.rule(() => <Final />)}
            {ReplaceNull} {Adapt.rule(() => null)}
        </Style>;
        await doBuild(root, { style, nullDomOk: true });
        if (hFirst.mountedOrig == null) throw should(hFirst.mountedOrig).be.ok();
        if (hSecond.mountedOrig == null) throw should(hSecond.mountedOrig).be.ok();
        if (hThird.mountedOrig == null) throw should(hThird.mountedOrig).be.ok();
    });

    it("Should callInstanceMethod return default on unassociated handle", () => {
        const hand = handle();
        should(callInstanceMethod(hand, "DEFAULT", "all")).equal("DEFAULT");
    });
    it("Should callInstanceMethod skip elements replaced by style", () => {
        should(callInstanceMethod(hFirst, "DEFAULT", "all")).equal("Final");
    });
    it("Should callInstanceMethod return default if all elements replaced by style", () => {
        should(callInstanceMethod(hSecond, "DEFAULT", "all")).equal("DEFAULT");
    });
    it("Should callInstanceMethod call method on mountedOrig", () => {
        should(callInstanceMethod(hThird, "DEFAULT", "all")).equal("Build1");
    });

    it("Should callFirstInstanceWithMethod return default on unassociated handle", () => {
        const hand = handle();
        should(callFirstInstanceWithMethod(hand, "DEFAULT", "all")).equal("DEFAULT");
    });
    it("Should callFirstInstanceWithMethod skip elements replaced by style", () => {
        should(callFirstInstanceWithMethod(hFirst, "DEFAULT", "all")).equal("Final");
    });
    it("Should callFirstInstanceMethod return default if all elements replaced by style", () => {
        should(callFirstInstanceWithMethod(hSecond, "DEFAULT", "all")).equal("DEFAULT");
    });
    it("Should callFirstInstanceWithMethod call method on mountedOrig", () => {
        should(callFirstInstanceWithMethod(hThird, "DEFAULT", "all")).equal("Build1");
    });
    it("Should callFirstInstanceWithMethod skip elements without method", () => {
        should(callFirstInstanceWithMethod(hThird, "DEFAULT", "onlyBuild2")).equal("Build2");
        should(callFirstInstanceWithMethod(hThird, "DEFAULT", "onlyFinal")).equal("Final");
    });
    it("Should callFirstInstanceWithMethod return default if no element has method", () => {
        should(callFirstInstanceWithMethod(hFirst, "DEFAULT", "none")).equal("DEFAULT");
        should(callFirstInstanceWithMethod(hThird, "DEFAULT", "none")).equal("DEFAULT");
    });

    it("Should callNextInstanceWithMethod throw on unassociated handle", () => {
        const hand = handle();
        should(() => callNextInstanceWithMethod(hand, "DEFAULT", "all"))
            .throwError(`Cannot find next instance when calling all: handle is not associated with any element`);
    });
    it("Should callNextInstanceWithMethod skip elements replaced by style", () => {
        should(callNextInstanceWithMethod(hFirst, "DEFAULT", "all")).equal("Final");
    });
    it("Should callNextInstanceMethod return default if all elements replaced by style", () => {
        should(callNextInstanceWithMethod(hSecond, "DEFAULT", "all")).equal("DEFAULT");
    });
    it("Should callNextInstanceWithMethod skip method on mountedOrig", () => {
        should(callNextInstanceWithMethod(hThird, "DEFAULT", "all")).equal("Build2");
    });
    it("Should callNextInstanceWithMethod skip elements without method", () => {
        should(callNextInstanceWithMethod(hThird, "DEFAULT", "onlyBuild2")).equal("Build2");
        should(callNextInstanceWithMethod(hThird, "DEFAULT", "onlyFinal")).equal("Final");
    });
    it("Should callNextInstanceWithMethod return default if no element has method", () => {
        should(callNextInstanceWithMethod(hFirst, "DEFAULT", "none")).equal("DEFAULT");
        should(callNextInstanceWithMethod(hThird, "DEFAULT", "none")).equal("DEFAULT");
    });
    it("Should callNextInstanceWithMethod return default if only mountedOrig has method", () => {
        should(callNextInstanceWithMethod(hThird, "DEFAULT", "onlyBuild1")).equal("DEFAULT");
    });
});
