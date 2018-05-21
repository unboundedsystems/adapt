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

describe("DOM CSS Build Tests", () => {
    it("Should replace empty primitive", () => {
        const orig = <unbs.Group />;
        const replace = <Empty id={1} />;
        const styles = unbs.parseStyles([
            unbs.style("Group", () => replace)
        ])

        const dom = unbs.build(orig, styles);

        should(unbs).not.Null();
        should(unbs.isElement(dom)).True();
        should(dom).equal(replace);
    });

    it("Should replace and simplify primitve", () => {
        const orig = <unbs.Group>
            <MakeMakeEmpty id={1} />
            <MakeMakeEmpty id={2} />
        </unbs.Group>
        const replace = <MakeEmpty id={123} />;
        const styles = unbs.parseStyles([
            unbs.style("MakeMakeEmpty", (props) => {
                if (props.id === 1) {
                    return replace;
                }
                return props.buildOrig();
            })
        ]);

        const dom = unbs.build(orig, styles);
        if (dom == null) {
            should(dom).not.Null();
            return;
        }
        checkChildComponents(dom, Empty, Empty);
        should(dom.props.children).eql([<Empty id={123} />, <Empty id={2} />]);
    });
});