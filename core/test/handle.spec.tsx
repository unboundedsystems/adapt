/*
 * Copyright 2018-2019 Unbounded Systems, LLC
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

import { repoVersions } from "@adpt/testutils";
import should from "should";
import Adapt, {
    AnyProps,
    BuildHelpers,
    Component,
    Group,
    handle,
    isHandle,
    isMountedElement,
    PrimitiveComponent,
    rule,
    serializeDom,
    Style,
    useImperativeMethods,
    useState,
} from "../src";
import { isHandleInternal } from "../src/handle";
import { reanimateDom } from "../src/internal";

import { doBuild, Empty, Info, MakeEmpty, MethodValue } from "./testlib";

const aVer = repoVersions.core;

class Anything extends PrimitiveComponent<AnyProps> {
}

class BuildNull extends Component<{}> {
    build() {
        return null;
    }
}

class CallReplace extends Component<{}> {
    build(helpers: BuildHelpers) {
        const a1 = <Anything id={1} />;
        const a2 = <Anything id={2} />;
        this.props.handle!.replaceTarget(a2, helpers);

        return (
            <Group handle={handle()}>
                {a1}
                {a2}
            </Group>
        );
    }
}

function Counter() {
    const [ count, setCount ] = useState(0);
    if (count < 2) setCount(count + 1);
    useImperativeMethods(() => ({
        current: () => count
    }));

    return <Info count={count} />;
}

describe("Element Handle", () => {
    it("Should be able to pass a handle in props", () => {
        const hand = handle();
        const orig = <Empty id={1} handle={hand} />;

        should(orig.props.handle).equal(hand);
    });

    it("Should create a handle if not in props", () => {
        const orig = <Empty id={1} />;
        should(isHandle(orig.props.handle)).be.True();
    });

    it("Should not allow the same handle to associate to two elements", () => {
        const hand = handle();
        should(() =>
            <Group>
                <Empty id={1} handle={hand} />
                <Empty id={2} handle={hand} />
            </Group>)
            .throwError(/Cannot associate a Handle with more than one AdaptElement. Original element type Empty/);
    });

    it("Should reference the correct built elements", async () => {
        const hand = handle();
        const orig =
            <Group>
                <MakeEmpty handle={hand} id={5} />
                <Anything ref={hand} />
            </Group>;
        const { dom, mountedOrig } = await doBuild(orig);
        if (dom == null) throw should(dom).not.be.Null();
        should(dom.props.children).have.length(2);
        should(dom.props.children[0].componentType).equal(Empty);
        should(dom.props.children[1].props.ref).equal(hand);
        should(dom.props.children[1].props.ref.target).equal(dom.props.children[0]);

        if (mountedOrig === null) throw should(mountedOrig).not.Null();
        const origChildren = mountedOrig.buildData.origChildren;
        if (origChildren === undefined) throw should(origChildren).not.Undefined();
        const anything = origChildren[1];
        const makeEmpty = origChildren[0];
        if (!isMountedElement(anything)) throw should(isMountedElement(anything)).True();
        should(anything.props.ref.mountedOrig).equal(makeEmpty);
    });

    it("Should reference final built element if replaced with style", async () => {
        const hand = handle();
        const orig =
            <Group>
                <MakeEmpty handle={hand} id={5} />
                <Anything ref={hand} />
            </Group>;
        const style =
            <Style>
                {Empty} {rule((_props) => <Anything final="yes" />)}
            </Style>;
        const { dom, mountedOrig } = await doBuild(orig, { style });
        if (dom == null) throw should(dom).not.be.Null();

        should(dom.props.children).have.length(2);
        should(dom.props.children[0].componentType).equal(Anything);
        should(dom.props.children[0].props.final).equal("yes");
        should(dom.props.children[1].props.ref).equal(hand);
        should(dom.props.children[1].props.ref.target).equal(dom.props.children[0]);

        if (mountedOrig === null) throw should(mountedOrig).not.Null();
        const origChildren = mountedOrig.buildData.origChildren;
        if (origChildren === undefined) throw should(origChildren).not.Undefined();
        const anything = origChildren[1];
        const replaced = origChildren[0];
        if (!isMountedElement(anything)) throw should(isMountedElement(anything)).True();
        should(anything.props.ref.mountedOrig).equal(replaced);
    });

    it("Should reference null if no final element present", async () => {
        const hand = handle();
        const orig =
            <Group>
                <BuildNull handle={hand} />
                <Anything ref={hand} />
            </Group>;
        const { dom } = await doBuild(orig);
        if (dom == null) throw should(dom).not.be.Null();
        should(dom.props.children.componentType).equal(Anything);
        should(dom.props.children.props.ref).equal(hand);
        should(dom.props.children.props.ref.target).be.Null();
    });

    it("Should return undefined for mountedOrig if element is never mounted", async () => {
        const hand = handle();
        <Group handle={hand} />;
        await doBuild(<Group />);
        should(hand.mountedOrig).Undefined();
    });

    it("Should reference other element if component build calls replace", async () => {
        const hand = handle();
        const orig =
            <Group>
                <CallReplace handle={hand} />
                <Anything ref={hand} />
            </Group>;
        const { dom, mountedOrig } = await doBuild(orig);
        if (dom == null) throw should(dom).not.be.Null();
        should(dom.props.children).have.length(2);

        const child0 = dom.props.children[0];
        const child1 = dom.props.children[1];
        should(child0.componentType).equal(Group);
        should(child0.props.children).have.length(2);

        const expectedTarget = child0.props.children[1];
        should(expectedTarget.componentType).equal(Anything);
        should(expectedTarget.props.id).equal(2);

        should(child1.props.ref).equal(hand);
        should(child1.props.ref.target).equal(expectedTarget);
        should(child1.props.ref.target.props.id).equal(2);

        if (mountedOrig === null) throw should(mountedOrig).not.Null();
        const origChildren = mountedOrig.buildData.origChildren;
        if (origChildren === undefined) throw should(origChildren).not.Undefined();
        const anything = origChildren[1];
        const callReplace = origChildren[0];
        if (!isMountedElement(anything)) throw should(isMountedElement(anything)).True();
        should(anything.props.ref.mountedOrig).equal(callReplace);
    });

    it("Should reference other element if style calls replace", async () => {
        const hand = handle();
        const orig =
            <Group>
                <MakeEmpty handle={hand} id={1} />
                <Anything ref={hand} />
            </Group>;
        const style =
            <Style>
                {Empty} {rule((props, info) => {
                    const a3 = <Anything id={3} />;
                    props.handle!.replaceTarget(a3, info);
                    return (
                        <Group>
                            <Anything id={2} />
                            {a3}
                        </Group>
                    );
                })}
            </Style>;
        const { dom } = await doBuild(orig, { style });
        if (dom == null) throw should(dom).not.be.Null();
        should(dom.props.children).have.length(2);

        const child0 = dom.props.children[0];
        const child1 = dom.props.children[1];
        should(child0.componentType).equal(Group);
        should(child0.props.children).have.length(2);

        const expectedTarget = child0.props.children[1];
        should(expectedTarget.componentType).equal(Anything);
        should(expectedTarget.props.id).equal(3);

        should(child1.props.ref).equal(hand);
        should(child1.props.ref.target).equal(expectedTarget);
        should(child1.props.ref.target.props.id).equal(3);
    });

    it("Should show handle reference in serialized DOM", async () => {
        const hand = handle();
        const orig =
            <Group>
                <MakeEmpty handle={hand} id={1} />
                <Anything ref={hand} />
            </Group>;
        const { dom } = await doBuild(orig);
        if (dom == null) throw should(dom).not.be.Null();
        should(dom.props.children).have.length(2);

        const domXml = serializeDom(dom);
        should(domXml).equal(
            `<Adapt>
  <Group key="Group">
    <Empty id="1">
      <__props__>
        <prop name="key">"MakeEmpty-Empty"</prop>
      </__props__>
    </Empty>
    <Anything>
      <__props__>
        <prop name="key">"Anything"</prop>
        <prop name="ref">{
  __adaptIsHandle: "2cc59ea3765538055042932741f6387d04a5fb8cc00350fe1ab755da3830a810",
  target: [
    "Group",
    "MakeEmpty-Empty",
  ],
  urn: "urn:Adapt:@adpt/core:${aVer}:$adaptExports:handle.js:HandleImpl",
}</prop>
      </__props__>
    </Anything>
  </Group>
</Adapt>
`);
    });

    it("Should show handle reference in serialized reanimateable DOM", async () => {
        const hand = handle();
        const orig =
            <Group>
                <MakeEmpty handle={hand} id={1} />
                <Anything ref={{ foo: [{ hand }] }} />
            </Group>;
        const { dom } = await doBuild(orig);
        if (dom == null) throw should(dom).not.be.Null();
        should(dom.props.children).have.length(2);

        const domXml = serializeDom(dom, { reanimateable: true });
        should(domXml).equal(
            `<Adapt>
  <Group key="Group" xmlns="urn:Adapt:@adpt/core:${aVer}::builtin_components/group.js:Group">
    <Empty id="1" xmlns="urn:Adapt:@adpt/core:${aVer}::../test/testlib/components.js:Empty">
      <__props__>
        <prop name="key">"MakeEmpty-Empty"</prop>
      </__props__>
      <__lifecycle__>
        <field name="stateNamespace">["Group","MakeEmpty","MakeEmpty-Empty"]</field>
        <field name="keyPath">["Group","MakeEmpty-Empty"]</field>
        <field name="path">"/Group/Empty"</field>
      </__lifecycle__>
    </Empty>
    <Anything xmlns="urn:Adapt:@adpt/core:${aVer}:$adaptExports:../test/handle.spec.js:Anything">
      <__props__>
        <prop name="key">"Anything"</prop>
        <prop name="ref">{
  foo: [
    {
      hand: {
        __adaptIsHandle: "2cc59ea3765538055042932741f6387d04a5fb8cc00350fe1ab755da3830a810",
        target: [
          "Group",
          "MakeEmpty-Empty",
        ],
        urn: "urn:Adapt:@adpt/core:${aVer}:$adaptExports:handle.js:HandleImpl",
      },
    },
  ],
}</prop>
      </__props__>
      <__lifecycle__>
        <field name="stateNamespace">["Group","Anything"]</field>
        <field name="keyPath">["Group","Anything"]</field>
        <field name="path">"/Group/Anything"</field>
      </__lifecycle__>
    </Anything>
    <__lifecycle__>
      <field name="stateNamespace">["Group"]</field>
      <field name="keyPath">["Group"]</field>
      <field name="path">"/Group"</field>
    </__lifecycle__>
  </Group>
</Adapt>
`);
    });

    it("Should reanimate serialized reference", async () => {
        const hand = handle();
        const orig =
            <Group>
                <MakeEmpty handle={hand} id={1} />
                <Anything ref={hand} />
            </Group>;
        const { dom } = await doBuild(orig);
        if (dom == null) throw should(dom).not.be.Null();
        should(dom.props.children).have.length(2);

        const domXml = serializeDom(dom, { reanimateable: true });
        const newDom = await reanimateDom(domXml, "deploy123", 0);

        if (newDom == null) throw should(newDom).not.be.Null();

        should(newDom.props.children[1].props.ref.target).equal(newDom.props.children[0]);
    });

    it("Should reanimate serialized null reference", async () => {
        const hand = handle();
        const orig =
            <Group>
                <BuildNull handle={hand} />
                <Anything ref={hand} />
            </Group>;
        const { dom } = await doBuild(orig);
        if (dom == null) throw should(dom).not.be.Null();
        should(dom.props.children.componentType).equal(Anything);

        should(hand.target).be.Null();

        const domXml = serializeDom(dom, { reanimateable: true });
        const newDom = await reanimateDom(domXml, "deploy123", 0);

        if (newDom == null) throw should(newDom).not.be.Null();

        should(newDom.props.children.props.ref.target).be.Null();
    });

    it("Should resolve to the last built version of a component", async () => {
        const hand = handle();
        const orig =
            <Group>
                <Counter handle={hand} />
                <MethodValue target={hand} method="current" />
            </Group>;
        const { dom } = await doBuild(orig);
        if (dom == null) throw should(dom).not.be.Null();

        const domXml = serializeDom(dom);
        should(domXml).equal(
`<Adapt>
  <Group key="Group">
    <Info count="2">
      <__props__>
        <prop name="key">"Counter-Info"</prop>
      </__props__>
    </Info>
    <Info value="2">
      <__props__>
        <prop name="key">"MethodValue-Info"</prop>
      </__props__>
    </Info>
  </Group>
</Adapt>
`);

    });

    it("Should replaceTarget not allow second replace", async () => {
        const orig = <Group />;
        const hand = orig.props.handle;
        if (!isHandleInternal(hand)) throw new Error(`Handle is not an impl`);
        const repl1 = <Group />;
        const repl2 = <Group />;

        // Replace the first time
        hand.replaceTarget(repl1, { buildNum: 1 });
        should(hand.target).equal(repl1);
        should(hand.targetReplaced({ buildNum: 1 })).be.True();
        should(hand.targetReplaced({ buildNum: 2 })).be.False();

        // Try again with same buildNum
        should(() => hand.replaceTarget(repl2, { buildNum: 1 }))
            .throwError("Cannot call replaceTarget on a Handle more than once");

        // Then with new buildNum
        hand.replaceTarget(repl2, { buildNum: 2 });
        should(hand.target).equal(repl2);
        should(hand.targetReplaced({ buildNum: 2 })).be.True();
        should(hand.targetReplaced({ buildNum: 3 })).be.False();
    });
});
