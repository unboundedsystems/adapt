import { repoVersions } from "@usys/testutils";
import * as Adapt from "../src";
import { doBuild } from "./testlib";

import should from "should";

const aVer = repoVersions.adapt;

export class Flex extends Adapt.PrimitiveComponent<Adapt.AnyProps> { }

//FIXME(manishv)  All the serialization tests should parse XML and check for
//semantic equivalence, not string equivalance.

describe("DOM Prop Serialization", () => {

    it("should serialize single element", () => {
        const ser = Adapt.serializeDom(<Adapt.Group />);
        should(ser).equal(`<Adapt>
  <Group/>
</Adapt>
`);
    });

    it("should serialize single element with short props", () => {
        const ser = Adapt.serializeDom(<Flex x={1} y="foobar" />);
        should(ser).equal(`<Adapt>
  <Flex x="1" y="foobar"/>
</Adapt>
`);
    });

    it("should serialize single element with long props", () => {
        const ser = Adapt.serializeDom(<Flex x={"1string"} />);
        should(ser).equal(`<Adapt>
  <Flex>
    <__props__>
      <prop name="x">"1string"</prop>
    </__props__>
  </Flex>
</Adapt>
`);

    });

    it("should serialize single element with object prop", () => {
        const ser = Adapt.serializeDom(<Flex x={{ a: 1, b: "foo" }} />);
        should(ser).equal(`<Adapt>
  <Flex>
    <__props__>
      <prop name="x">{
  "a": 1,
  "b": "foo"
}</prop>
    </__props__>
  </Flex>
</Adapt>
`);
    });

    it("should serialize prop named xmlns long form", () => {
      const ser = Adapt.serializeDom(<Flex xmlns="foo" />);
      should(ser).equal(`<Adapt>
  <Flex>
    <__props__>
      <prop name="xmlns">"foo"</prop>
    </__props__>
  </Flex>
</Adapt>
`);
    });

    it("should serialize prop starting with xmlns: long form", () => {
      const props = {
        "xmlns:bar": "foo"
      };

      const ser = Adapt.serializeDom(<Flex {...props} xmlnsness="bar" />);
      should(ser).equal(`<Adapt>
  <Flex xmlnsness="bar">
    <__props__>
      <prop name="xmlns:bar">"foo"</prop>
    </__props__>
  </Flex>
</Adapt>
`);
    });

});

describe("DOM Child Serialization", () => {
    it("should serialize child elements", () => {
        const ser = Adapt.serializeDom(<Adapt.Group><Flex id={1} /><Flex id={2} /></Adapt.Group>);
        should(ser).equal(`<Adapt>
  <Group>
    <Flex id="1"/>
    <Flex id="2"/>
  </Group>
</Adapt>
`);
    });

    it("should serialize JSON-able children", () => {
        const ser = Adapt.serializeDom(<Flex>{{ x: 1, y: 2 }}</Flex>);
        should(ser).equal(`<Adapt>
  <Flex>
    <json>{
  "x": 1,
  "y": 2
}</json>
  </Flex>
</Adapt>
`);
    });

    it("should serialize non-JSON-able children", () => {
        const f = () => null;
        const ser = Adapt.serializeDom(<Flex>{f}</Flex>);
        should(ser).equal(`<Adapt>
  <Flex>
    <typescript>
      <![CDATA[${f.toString()}]]>
    </typescript>
  </Flex>
</Adapt>
`);
    });

});

// tslint:disable:max-line-length

describe("DOM Reanimateable Serialization", () => {
    it("Should serialize component reanimation info", () => {
        const ser = Adapt.serializeDom(
            <Adapt.Group><Flex id={1} /><Flex id={2} /></Adapt.Group>,
            { reanimateable: true }
        );
        should(ser).equal(`<Adapt>
  <Group xmlns="urn:Adapt:@usys/adapt:${aVer}::builtin_components/group.js:Group">
    <Flex id="1" xmlns="urn:Adapt:@usys/adapt:${aVer}::../test/dom_serializer.spec.js:Flex"/>
    <Flex id="2" xmlns="urn:Adapt:@usys/adapt:${aVer}::../test/dom_serializer.spec.js:Flex"/>
  </Group>
</Adapt>
`);

    });
});

describe("DOM Serialization Options", () => {
    let dom: Adapt.AdaptElement;
    before(async () => {
        const out = await doBuild(<Adapt.Group><Flex id={1} /><Flex id={2} /></Adapt.Group>);
        dom = out.dom;
    });

    it("Should serialize props=none", () => {
        const ser = Adapt.serializeDom(dom, { props: "none" });
        should(ser).equal(`<Adapt>
  <Group>
    <Flex/>
    <Flex/>
  </Group>
</Adapt>
`);
    });

    it("Should serialize props=key only", () => {
        const ser = Adapt.serializeDom(dom, { props: ["key"] });
        should(ser).equal(`<Adapt>
  <Group key="Group">
    <Flex key="Flex"/>
    <Flex key="Flex1"/>
  </Group>
</Adapt>
`);
    });
});
