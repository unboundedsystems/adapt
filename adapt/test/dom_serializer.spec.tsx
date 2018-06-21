import * as unbs from "../src";

import * as should from "should";

class Flex extends unbs.PrimitiveComponent<unbs.AnyProps> { }

//FIXME(manishv)  All the serialization tests should parse XML and check for
//semantic equivalence, not string equivalance.

describe("DOM Prop Serialization", () => {

    it("should serialize single element", () => {
        const ser = unbs.serializeDom(<unbs.Group />);
        should(ser).equal(`<unbs>
  <Group/>
</unbs>
`);
    });

    it("should serialize single element with short props", () => {
        const ser = unbs.serializeDom(<Flex x={1} y="foobar" />);
        should(ser).equal(`<unbs>
  <Flex x="1" y="foobar"/>
</unbs>
`);
    });

    it("should serialize single element with long props", () => {
        const ser = unbs.serializeDom(<Flex x={"1string"} />);
        should(ser).equal(`<unbs>
  <Flex>
    <__props__>
      <prop name="x">"1string"</prop>
    </__props__>
  </Flex>
</unbs>
`);

    });

    it("should serialize single element with object prop", () => {
        const ser = unbs.serializeDom(<Flex x={{ a: 1, b: "foo" }} />);
        should(ser).equal(`<unbs>
  <Flex>
    <__props__>
      <prop name="x">{
  "a": 1,
  "b": "foo"
}</prop>
    </__props__>
  </Flex>
</unbs>
`);
    });
});

describe("DOM Child Serialization", () => {
    it("should serialize child elements", () => {
        const ser = unbs.serializeDom(<unbs.Group><Flex id={1} /><Flex id={2} /></unbs.Group>);
        should(ser).equal(`<unbs>
  <Group>
    <Flex id="1"/>
    <Flex id="2"/>
  </Group>
</unbs>
`);
    });

    it("should serialize JSON-able children", () => {
        const ser = unbs.serializeDom(<Flex>{{ x: 1, y: 2 }}</Flex>);
        should(ser).equal(`<unbs>
  <Flex>
    <json>{
  "x": 1,
  "y": 2
}</json>
  </Flex>
</unbs>
`);
    });

    it("should serialize non-JSON-able children", () => {
        const f = () => null;
        const ser = unbs.serializeDom(<Flex>{f}</Flex>);
        should(ser).equal(`<unbs>
  <Flex>
    <typescript>
      <![CDATA[${f.toString()}]]>
    </typescript>
  </Flex>
</unbs>
`);
    });

});
