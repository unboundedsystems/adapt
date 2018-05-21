import * as util from 'util';
import * as unbs from '../src';

import should = require('should');

import {
    checkChildComponents,
    Empty,
    MakeEmpty,
    MakeMakeEmpty,
    MakeGroup
} from './testlib';

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
        </unbs.Group>

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
        </unbs.Group>

        const dom = unbs.build(orig, null);
        if (dom == null) {
            should(dom).not.Null();
            return;
        }
        checkChildComponents(dom, Empty, Empty);
        should(dom.props.children).eql([<Empty id={1} />, <Empty id={2} />]);
    });
})