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
import Adapt, { handle } from "../../src";
import { useImperativeMethods, useMethodFrom } from "../../src/hooks";
import { doBuild } from "../testlib";

function BaseTester() {
    useImperativeMethods(() => ({
        doit: (...args: any[]) => args
    }));
    return null;
}

function Tester(props: { defVal?: any, noBase: boolean, noHand: boolean }) {
    const base = handle();
    useMethodFrom(props.noHand ? null : base, "doit", props.defVal);
    if (props.noBase) return null;
    return <BaseTester handle={base} />;
}
Tester.defaultProps = { noBase: false, noHand: false };

describe("useMethodFrom Tests", () => {
    it("Should return default values when handle is not attached", async () => {
        const val = "DEFAULT";
        const { mountedOrig } = await doBuild(<Tester noBase={true} defVal={val} />, { nullDomOk: true });
        if (mountedOrig === null) throw should(mountedOrig).not.Null();
        should(mountedOrig.instance.doit()).equal(val);
    });

    it("Should invoke function without arguments", async () => {
        const { mountedOrig } = await doBuild(<Tester />, { nullDomOk: true });
        if (mountedOrig === null) throw should(mountedOrig).not.Null();
        should(mountedOrig.instance.doit()).eql([]);
    });

    it("Should invoke function with 3 arguments", async () => {
        const { mountedOrig } = await doBuild(<Tester />, { nullDomOk: true });
        if (mountedOrig === null) throw should(mountedOrig).not.Null();
        const args = [{ a: 1 }, { b: 2 }, { c: 3 }];
        should(mountedOrig.instance.doit(...args)).eql(args);
    });

    it("Should return default values when handle is null", async () => {
        const val = "DEFAULT";
        const { mountedOrig } = await doBuild(<Tester noHand={true} defVal={val} />, { nullDomOk: true });
        if (mountedOrig === null) throw should(mountedOrig).not.Null();
        should(mountedOrig.instance.doit()).equal(val);
    });
});
