import * as unbs from "../src";

import should = require("should");

import {
    checkChildComponents,
    Empty,
    MakeEmpty,
    MakeGroup,
    MakeMakeEmpty
} from "./testlib";

describe("DOM Basic Build Tests", () => {
    it("Should build empty primitive", () => {
        const orig = <unbs.Group />;
        const dom = unbs.build(orig, null);

        should(unbs).not.Null();
        should(unbs.isElement(dom)).True();
        should(dom).not.equal(orig);
        should(dom).eql(orig);
    });

    it("Should substitue props.children as flat", () => {
        const orig = <MakeGroup>
            <Empty id={1} />
            <Empty id={2} />
        </MakeGroup>;

        const dom = unbs.build(orig, null);
        if (dom == null) {
            should(dom).not.Null();
            return;
        }
        should(dom.componentType).equal(unbs.Group);
        should(dom.props.children).eql([<Empty id={1} />, <Empty id={2} />]);
    });

    it("Should build recursively", () => {
        const orig = <unbs.Group>
            <MakeMakeEmpty id={1} />
            <MakeMakeEmpty id={2} />
        </unbs.Group>;

        const dom = unbs.build(orig, null);
        if (dom == null) {
            should(dom).not.Null();
            return;
        }
        checkChildComponents(dom, Empty, Empty);
        should(dom.props.children).eql([<Empty id={1} />, <Empty id={2} />]);
    });

    it("Should pass through primitives with children", () => {
        const orig = <unbs.Group>
            <Empty id={1} />
            <Empty id={2} />
        </unbs.Group>;

        const dom = unbs.build(orig, null);
        if (dom == null) {
            should(dom).not.Null();
            return;
        }
        checkChildComponents(dom, Empty, Empty);
        should(dom.props.children).eql([<Empty id={1} />, <Empty id={2} />]);
    });
});

describe("DOM Shallow Build Tests", () => {
    it("Should respect shallow option", () => {
        const body = <MakeEmpty id={1} />;
        const orig = <MakeGroup>{body}</MakeGroup>;
        const expected = <unbs.Group>{body}</unbs.Group>;

        const dom = unbs.build(orig, null, { shallow: true });
        if (dom == null) {
            should(dom).not.Null();
            return;
        }
        should(dom).eql(expected);
    });

    it("Should respect depth 0 as no-op", () => {
        const orig = <MakeMakeEmpty id={1} />;
        const dom = unbs.build(orig, null, { depth: 0 });
        if (dom == null) {
            should(dom).not.Null();
            return;
        }
        should(dom).eql(orig);
    });

    it("Should respect depth option", () => {
        const noChange = <unbs.Group>
            <MakeEmpty id={1} />
        </unbs.Group>;

        const orig = <unbs.Group>
            {noChange}
            <MakeEmpty id={2} />
        </unbs.Group>;

        const expected = <unbs.Group>
            {noChange}
            <Empty id={2} />
        </unbs.Group>;

        const dom = unbs.build(orig, null, { depth: 2 });
        if (dom == null) {
            should(dom).not.Null();
            return;
        }
        should(dom).eql(expected);
    });

    /* it("Exper", () => {
        const dom =
            <MakeGroup>
                <MakeMakeEmpty id={1} />
                <MakeGroup>
                    <MakeMakeEmpty id={2} />
                    <MakeGroup>
                        <MakeEmpty id={3} />
                    </MakeGroup>
                </MakeGroup>
            </MakeGroup>;

        for (let i = 0; i < 5; i++) {
            const newDom = unbs.build(dom, null, { depth: i });
            if (newDom == null) {
                break;
            }
            // tslint:disable-next-line:no-console
            console.log(unbs.serializeDom(newDom));
        }
    }); */
});
