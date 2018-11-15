import * as should from "should";
import Adapt, {
    AdaptElement,
    AdaptElementOrNull,
    AnyProps,
    build,
    Component,
    Group,
    handle,
    isHandle,
    PrimitiveComponent,
    rule,
    serializeDom,
    Style,
} from "../src";
import { reanimateDom } from "../src/internal";

import { Empty, MakeEmpty } from "./testlib";

class Anything extends PrimitiveComponent<AnyProps> {
}

class BuildNull extends Component<{}> {
    build() {
        return null;
    }
}

class CallReplace extends Component<{}> {
    build() {
        const a1 = <Anything id={1} />;
        const a2 = <Anything id={2} />;
        this.props.handle!.replaceTarget(a2);

        return (
            <Group handle={handle()}>
                {a1}
                {a2}
            </Group>
        );
    }
}

async function doBuild(orig: AdaptElement, style: AdaptElementOrNull = null) {
    const { contents: dom, messages } = await build(orig, style);
    should(messages).have.length(0);
    return dom;
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

    it("Should reference final built element", async () => {
        const hand = handle();
        const orig =
            <Group>
                <MakeEmpty handle={hand} id={5} />
                <Anything ref={hand} />
            </Group>;
        const dom = await doBuild(orig);
        if (dom == null) throw should(dom).not.be.Null();
        should(dom.props.children).have.length(2);
        should(dom.props.children[0].componentType).equal(Empty);
        should(dom.props.children[1].props.ref).equal(hand);
        should(dom.props.children[1].props.ref.target).equal(dom.props.children[0]);
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
                {Empty} {rule((props) => <Anything final="yes" />)}
            </Style>;
        const dom = await doBuild(orig, style);
        if (dom == null) throw should(dom).not.be.Null();

        should(dom.props.children).have.length(2);
        should(dom.props.children[0].componentType).equal(Anything);
        should(dom.props.children[0].props.final).equal("yes");
        should(dom.props.children[1].props.ref).equal(hand);
        should(dom.props.children[1].props.ref.target).equal(dom.props.children[0]);
    });

    it("Should reference null if no final element present", async () => {
        const hand = handle();
        const orig =
            <Group>
                <BuildNull handle={hand} />
                <Anything ref={hand} />
            </Group>;
        const dom = await doBuild(orig);
        if (dom == null) throw should(dom).not.be.Null();
        should(dom.props.children.componentType).equal(Anything);
        should(dom.props.children.props.ref).equal(hand);
        should(dom.props.children.props.ref.target).be.Null();
    });

    it("Should reference other element if component build calls replace", async () => {
        const hand = handle();
        const orig =
            <Group>
                <CallReplace handle={hand} />
                <Anything ref={hand} />
            </Group>;
        const dom = await doBuild(orig);
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
                {Empty} {rule((props) => {
                    const a3 = <Anything id={3} />;
                    props.handle!.replaceTarget(a3);
                    return (
                        <Group>
                            <Anything id={2} />
                            {a3}
                        </Group>
                    );
                })}
            </Style>;
        const dom = await doBuild(orig, style);
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
        const dom = await doBuild(orig);
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
        <prop name="ref">
          <Handle>{
  "target": [
    "Group",
    "MakeEmpty-Empty"
  ]
}</Handle>
        </prop>
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
                <Anything ref={hand} />
            </Group>;
        const dom = await doBuild(orig);
        if (dom == null) throw should(dom).not.be.Null();
        should(dom.props.children).have.length(2);

        const domXml = serializeDom(dom, true);
        should(domXml).equal(
`<Adapt>
  <Group key="Group" xmlns="urn:Adapt:@usys/adapt:0.0.1::builtin_components.js:Group">
    <Empty id="1" xmlns="urn:Adapt:@usys/adapt:0.0.1::../test/testlib.js:Empty">
      <__props__>
        <prop name="key">"MakeEmpty-Empty"</prop>
      </__props__>
      <__lifecycle__>
        <field name="stateNamespace">["Group","MakeEmpty","MakeEmpty-Empty"]</field>
        <field name="keyPath">["Group","MakeEmpty-Empty"]</field>
        <field name="path">"/Group/Empty"</field>
      </__lifecycle__>
    </Empty>
    <Anything xmlns="urn:Adapt:@usys/adapt:0.0.1:$adaptExports:../test/handle.spec.js:Anything">
      <__props__>
        <prop name="key">"Anything"</prop>
        <prop name="ref">
          <Handle xmlns="urn:Adapt:@usys/adapt:0.0.1:$adaptExports:handle.js:HandleImpl">{
  "target": [
    "Group",
    "MakeEmpty-Empty"
  ]
}</Handle>
        </prop>
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
        const dom = await doBuild(orig);
        if (dom == null) throw should(dom).not.be.Null();
        should(dom.props.children).have.length(2);

        const domXml = serializeDom(dom, true);
        const newDom = await reanimateDom(domXml);

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
        const dom = await doBuild(orig);
        if (dom == null) throw should(dom).not.be.Null();
        should(dom.props.children.componentType).equal(Anything);

        should(hand.target).be.Null();

        const domXml = serializeDom(dom, true);
        const newDom = await reanimateDom(domXml);

        if (newDom == null) throw should(newDom).not.be.Null();

        should(newDom.props.children.props.ref.target).be.Null();
    });
});
