import * as util from 'util';
import * as unbs from '../src';

import should = require('should');

import { checkChildComponents } from './testlib';

class Empty extends unbs.PrimitiveComponent<{ id: number }> { };

function MakeMakeEmpty(props: { id: number }) {
    return <MakeEmpty id={props.id} />;
}

function MakeEmpty(props: { id: number }) {
    return <Empty id={props.id} />;
}

function MakeGroup(props: { children: unbs.UnbsElement[] }) {
    return <unbs.Group>{props.children}</unbs.Group>;
}

describe("DOM Basic Build Tests", () => {
    it("Should build empty primitive", () => {
        const orig = <unbs.Group />;
        const dom = unbs.build(orig, []);

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

        const dom = unbs.build(orig, []);
        if(dom == null) {
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

        const dom = unbs.build(orig, []);
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

        const dom = unbs.build(orig, []);
        if (dom == null) {
            should(dom).not.Null();
            return;
        }
        checkChildComponents(dom, Empty, Empty);
        should(dom.props.children).eql([<Empty id={1} />, <Empty id={2} />]);
    });
})