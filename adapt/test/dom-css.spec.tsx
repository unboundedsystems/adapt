import * as Adapt from "../src";

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
        const orig = <Adapt.Group />;
        const replace = <Empty id={1} />;
        const styles = <Adapt.Style>{Adapt.Group} {Adapt.rule(() => replace)}</Adapt.Style>;

        const { contents: dom } = Adapt.build(orig, styles);

        should(Adapt).not.Null();
        should(Adapt.isElement(dom)).True();
        should(dom).eql(replace);
    });

    it("Should replace and simplify primitve", () => {
        const orig = <Adapt.Group>
            <MakeMakeEmpty id={1} />
            <MakeMakeEmpty id={2} />
        </Adapt.Group>;
        const replace = <MakeEmpty id={123} />;
        const styles = <Adapt.Style>
            {MakeMakeEmpty} {Adapt.rule((props, info) => {
                if (props.id === 1) {
                    return replace;
                }
                return info.origBuild(props);
            })}
        </Adapt.Style>;

        const { contents: dom } = Adapt.build(orig, styles);
        if (dom == null) {
            should(dom).not.Null();
            return;
        }
        checkChildComponents(dom, Empty, Empty);
        should(dom.props.children).eql([<Empty id={123} />, <Empty id={2} />]);
    });

    it("Should process all matching rules once", () => {
        const orig = <Adapt.Group>
            <MakeMakeEmpty id={1} />
            <MakeMakeEmpty id={2} />
        </Adapt.Group>;
        const action = (props: Adapt.AnyProps, info: Adapt.StyleBuildInfo) => {
            return info.origBuild(props);
        };
        const fakes = [ fake(action), fake(action), fake(action) ];
        const styles =
            <Adapt.Style>
                {Empty} {Adapt.rule(fakes[0])}
                {Empty} {Adapt.rule(fakes[1])}
                {Empty} {Adapt.rule(fakes[2])}
            </Adapt.Style>;

        const { contents: dom } = Adapt.build(orig, styles);
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
