import * as should from "should";

import * as back from "../src";
import { DOMNode } from "../src/dom";

describe("DOM Parse Tests", () => {
    it("Should parse empty DOM", async () => {
        const xmlStr = "<unbs></unbs>";
        const dom = await back.domFromString(xmlStr);
        should(dom).Null();
    });

    it("Should not parse unknown root", async () => {
        const xmlStr = "<bogus></bogus>";
        should(back.domFromString(xmlStr)).rejectedWith(Error);
    });

    it("Should reject multiple top-level nodes", async () => {
        const xmlStr = "<unbs><foo/><bar/></unbs>";
        should(back.domFromString(xmlStr)).rejectedWith(Error);
    });

    it("Should parse node with no children", async () => {
        const xmlStr = "<unbs><foo/></unbs>";
        const dom = await back.domFromString(xmlStr);
        if (dom == null) {
            should(dom).not.Null();
            return;
        }
        should(dom).eql(new DOMNode("foo", {}));
    });

    it("Should parse node with single child", async () => {
        const xmlStr = "<unbs><foo><bar/></foo></unbs>";
        const dom = await back.domFromString(xmlStr);
        if (dom == null) {
            should(dom).not.Null();
            return;
        }

        const bar = new DOMNode("bar", {});
        const expectedRoot = new DOMNode("foo", {}, [bar]);

        should(dom).deepEqual(expectedRoot);
        should(dom.props.children).eql(bar); //Needed in case DOMNode has bug
    });

    it("Should parse node with multiple children", async () => {
        const xmlStr = "<unbs><foo><bar/><bar/></foo></unbs>";
        const dom = await back.domFromString(xmlStr);
        if (dom == null) {
            should(dom).not.Null();
            return;
        }

        const bar = new DOMNode("bar", {});
        const expectedRoot = new DOMNode("foo", {}, [bar, bar]);

        should(dom).deepEqual(expectedRoot);
        should(dom.props.children).eql([bar, bar]); //Needed in case DOMNode has bug
    });

    it("Should parse json node", async () => {
        const obj = { x: 1, y: 1 };
        const json = JSON.stringify(obj);
        const xmlStr = `<unbs><foo><json>${json}</json></foo></unbs>`;
        const dom = await back.domFromString(xmlStr);
        if (dom == null) {
            should(dom).not.Null();
            return;
        }

        const expectedRoot = new DOMNode("foo", {}, [obj]);

        should(dom).deepEqual(expectedRoot);
        should(dom.props.children).eql(obj); //Needed in case DOMNode has bug
    });

    it("Should parse short form props", async () => {
        const xmlStr = `<unbs><foo x="12" y="foo"/></unbs>`;
        const dom = await back.domFromString(xmlStr);
        if (dom == null) {
            should(dom).not.Null();
            return;
        }

        const expectedRoot = new DOMNode("foo", { x: 12, y: "foo" });
        should(dom).deepEqual(expectedRoot);
    });

    it("Should reject ambiguous short form props", () => {
        const xmlStr = `<unbs><foo x="12px"/></unbs>`;
        should(back.domFromString(xmlStr)).rejectedWith(Error);
    });

    it("Should parse long form props", async () => {
        const xmlStr =
            `<unbs>
                <foo>
                    <__props__>
                        <prop name="x">{ "z": 3 }</prop>
                    </__props__>
                </foo>
            </unbs>`;
        const dom = await back.domFromString(xmlStr);
        if (dom == null) {
            should(dom).not.Null();
            return;
        }

        const expectedRoot = new DOMNode("foo", { x: { z: 3 } });
        should(dom).deepEqual(expectedRoot);
    });

    it("Should forbid duplicate props", async () => {
        const xmlStr =
            `<unbs>
                <foo x="5">
                    <__props__>
                        <prop name="x">{ "z": 3 }</prop>
                    </__props__>
                </foo>
            </unbs>`;
        should(back.domFromString(xmlStr)).rejectedWith(Error);
    });
});
