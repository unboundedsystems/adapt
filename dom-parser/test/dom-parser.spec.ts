import * as should from "should";

import * as back from "../src";
import { DOMNode } from "../src/dom";

describe("DOM Parse Tests", () => {
    it("Should parse empty DOM", async () => {
        const xmlStr = "<Adapt></Adapt>";
        const dom = await back.domFromString(xmlStr);
        should(dom).Null();
    });

    it("Should not parse unknown root", async () => {
        const xmlStr = "<bogus></bogus>";
        should(back.domFromString(xmlStr)).rejectedWith(Error);
    });

    it("Should reject multiple top-level nodes", async () => {
        const xmlStr = "<Adapt><foo/><bar/></Adapt>";
        should(back.domFromString(xmlStr)).rejectedWith(Error);
    });

    it("Should parse node with no children", async () => {
        const xmlStr = "<Adapt><foo/></Adapt>";
        const dom = await back.domFromString(xmlStr);
        if (dom == null) {
            should(dom).not.Null();
            return;
        }
        should(dom).eql(new DOMNode("foo", {}, ""));
    });

    it("Should parse node with single child", async () => {
        const xmlStr = "<Adapt><foo><bar/></foo></Adapt>";
        const dom = await back.domFromString(xmlStr);
        if (dom == null) {
            should(dom).not.Null();
            return;
        }

        const bar = new DOMNode("bar", {}, "");
        const expectedRoot = new DOMNode("foo", {}, "", [bar]);

        should(dom).deepEqual(expectedRoot);
        should(dom.props.children).eql(bar); //Needed in case DOMNode has bug
    });

    it("Should parse node with multiple children", async () => {
        const xmlStr = "<Adapt><foo><bar/><bar/></foo></Adapt>";
        const dom = await back.domFromString(xmlStr);
        if (dom == null) {
            should(dom).not.Null();
            return;
        }

        const bar = new DOMNode("bar", {}, "");
        const expectedRoot = new DOMNode("foo", {}, "", [bar, bar]);

        should(dom).deepEqual(expectedRoot);
        should(dom.props.children).eql([bar, bar]); //Needed in case DOMNode has bug
    });

    it("Should parse json node", async () => {
        const obj = { x: 1, y: 1 };
        const json = JSON.stringify(obj);
        const xmlStr = `<Adapt><foo><json>${json}</json></foo></Adapt>`;
        const dom = await back.domFromString(xmlStr);
        if (dom == null) {
            should(dom).not.Null();
            return;
        }

        const expectedRoot = new DOMNode("foo", {}, "", [obj]);

        should(dom).deepEqual(expectedRoot);
        should(dom.props.children).eql(obj); //Needed in case DOMNode has bug
    });

    it("Should parse short form props", async () => {
        const xmlStr = `<Adapt><foo x="12" y="foo"/></Adapt>`;
        const dom = await back.domFromString(xmlStr);
        if (dom == null) {
            should(dom).not.Null();
            return;
        }

        const expectedRoot = new DOMNode("foo", { x: 12, y: "foo" }, "");
        should(dom).deepEqual(expectedRoot);
    });

    it("Should reject ambiguous short form props", () => {
        const xmlStr = `<Adapt><foo x="12px"/></Adapt>`;
        should(back.domFromString(xmlStr)).rejectedWith(Error);
    });

    it("Should parse long form props", async () => {
        const xmlStr =
            `<Adapt>
                <foo>
                    <__props__>
                        <prop name="x">{ "z": 3 }</prop>
                    </__props__>
                </foo>
            </Adapt>`;
        const dom = await back.domFromString(xmlStr);
        if (dom == null) {
            should(dom).not.Null();
            return;
        }

        const expectedRoot = new DOMNode("foo", { x: { z: 3 } }, "");
        should(dom).deepEqual(expectedRoot);
    });

    it("Should forbid duplicate props", async () => {
        const xmlStr =
            `<Adapt>
                <foo x="5">
                    <__props__>
                        <prop name="x">{ "z": 3 }</prop>
                    </__props__>
                </foo>
            </Adapt>`;
        should(back.domFromString(xmlStr)).rejectedWith(Error);
    });

    it("Should parse xmlns", async () => {
        const xmlStr =
            `<Adapt>
                <d:Foo  xmlns:d='http://www.example.com/stuff'
                        xmlns='urn:bar' id='3235329' >
                    <__props__>
                        <prop name="x">{ "z": 3 }</prop>
                    </__props__>
                    <Foo    xmlns='urn:Adapt:%40usys%2Fadapt/0.0.1/builtin_components.js'>
                        <__props__>
                            <prop name="a">{ "b": 3 }</prop>
                        </__props__>
                    </Foo>
                    <Foo baz="avalue"/>
                </d:Foo>
            </Adapt>`;
        const dom = await back.domFromString(xmlStr);
        if (dom == null) {

            should(dom).not.Null();
            return;
        }

        const foo2 = new DOMNode(
            "Foo",
            { a: { b: 3 } },
            "urn:Adapt:%40usys%2Fadapt/0.0.1/builtin_components.js"
        );
        const foo3 = new DOMNode(
            "Foo",
            { baz: "avalue"},
            "urn:bar"
        );
        const fooRoot = new DOMNode(
            "Foo",
            { id: 3235329, x: { z: 3 } },
            "http://www.example.com/stuff",
            [foo2, foo3]
        );
        should(dom).deepEqual(fooRoot);
    });
});
