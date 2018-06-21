import * as unbs from "../src";

import should = require("should");
import { fake } from "sinon";

import {
    checkChildComponents,
    Empty,
    MakeEmpty,
    MakeMakeEmpty,
} from "./testlib";

describe("DOM CSS Build Tests", () => {
    it("Should replace empty primitive", () => {
        const orig = <unbs.Group />;
        const replace = <Empty id={1} />;
        const styles = <unbs.Style>{unbs.Group} {unbs.rule(() => replace)}</unbs.Style>;

        const { contents: dom } = unbs.build(orig, styles);

        should(unbs).not.Null();
        should(unbs.isElement(dom)).True();
        should(dom).eql(replace);
    });

    it("Should replace and simplify primitve", () => {
        const orig = <unbs.Group>
            <MakeMakeEmpty id={1} />
            <MakeMakeEmpty id={2} />
        </unbs.Group>;
        const replace = <MakeEmpty id={123} />;
        const styles = <unbs.Style>
            {MakeMakeEmpty} {unbs.rule((props, info) => {
                if (props.id === 1) {
                    return replace;
                }
                return info.origBuild(props);
            })}
        </unbs.Style>;

        const { contents: dom } = unbs.build(orig, styles);
        if (dom == null) {
            should(dom).not.Null();
            return;
        }
        checkChildComponents(dom, Empty, Empty);
        should(dom.props.children).eql([<Empty id={123} />, <Empty id={2} />]);
    });

    it("Should process all matching rules once", () => {
        const orig = <unbs.Group>
            <MakeMakeEmpty id={1} />
            <MakeMakeEmpty id={2} />
        </unbs.Group>;
        const action = (props: unbs.AnyProps, info: unbs.StyleBuildInfo) => {
            return info.origBuild(props);
        };
        const fakes = [ fake(action), fake(action), fake(action) ];
        const styles =
            <unbs.Style>
                {Empty} {unbs.rule(fakes[0])}
                {Empty} {unbs.rule(fakes[1])}
                {Empty} {unbs.rule(fakes[2])}
            </unbs.Style>;

        const { contents: dom } = unbs.build(orig, styles);
        if (dom == null) {
            should(dom).not.Null();
            return;
        }
        checkChildComponents(dom, Empty, Empty);
        should(dom.props.children).eql([<Empty id={1} />, <Empty id={2} />]);
        fakes.forEach((f, i) => {
            const msg = `Failed for fake[${i}]`;
            f.callCount.should.equal(2, msg); // Once for each Empty
            f.firstCall.args[0].id.should.equal(1, msg);
            f.secondCall.args[0].id.should.equal(2, msg);
        });
    });
});
