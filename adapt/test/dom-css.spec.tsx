import * as Adapt from "../src";

import should = require("should");
import { fake } from "sinon";

import {
    checkChildComponents,
    deepFilterElemsToPublic,
    Empty,
    MakeEmpty,
    MakeMakeEmpty,
} from "./testlib";

describe("DOM CSS Build Tests", () => {
    it("Should replace empty primitive", async () => {
        const orig = <Adapt.Group key="root" />;
        const replace = <Empty id={1} />;
        const styles = <Adapt.Style>{Adapt.Group} {Adapt.rule(() => replace)}</Adapt.Style>;

        const { contents: dom } = await Adapt.buildOnce(orig, styles);

        should(Adapt).not.Null();
        should(Adapt.isElement(dom)).True();
        const expected = deepFilterElemsToPublic(<Empty id={1} key="root-Empty" />);
        should(deepFilterElemsToPublic(dom)).eql(expected);
    });

    it("Should replace and simplify primitve", async () => {
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

        const { contents: dom } = await Adapt.buildOnce(orig, styles);
        if (dom == null) {
            should(dom).not.Null();
            return;
        }
        checkChildComponents(dom, Empty, Empty);
        const expected = deepFilterElemsToPublic([
            <Empty key="MakeMakeEmpty-MakeEmpty-Empty" id={123} />,
            <Empty key="MakeMakeEmpty1-MakeEmpty-Empty" id={2} />]);
        should(deepFilterElemsToPublic(dom.props.children)).eql(expected);
    });

    it("Should process all matching rules once", async () => {
        const orig = <Adapt.Group>
            <MakeMakeEmpty id={1} />
            <MakeMakeEmpty id={2} />
        </Adapt.Group>;
        const action = (props: Adapt.AnyProps, info: Adapt.StyleBuildInfo) => {
            return info.origBuild(props);
        };
        const fakes = [fake(action), fake(action), fake(action)];
        const styles =
            <Adapt.Style>
                {Empty} {Adapt.rule(fakes[0])}
                {Empty} {Adapt.rule(fakes[1])}
                {Empty} {Adapt.rule(fakes[2])}
            </Adapt.Style>;

        const { contents: dom } = await Adapt.buildOnce(orig, styles);
        if (dom == null) {
            should(dom).not.Null();
            return;
        }
        checkChildComponents(dom, Empty, Empty);
        const expectedChildren = deepFilterElemsToPublic([
            <Empty key="MakeMakeEmpty-MakeEmpty-Empty-Empty-Empty-Empty" id={1} />,
            <Empty key="MakeMakeEmpty1-MakeEmpty-Empty-Empty-Empty-Empty" id={2} />]);
        should(deepFilterElemsToPublic(dom.props.children)).eql(expectedChildren);
        fakes.forEach((f, i) => {
            const msg = `Failed for fake[${i}]`;
            f.callCount.should.equal(2, msg); // Once for each Empty
            f.firstCall.args[0].id.should.equal(1, msg);
            f.secondCall.args[0].id.should.equal(2, msg);
        });
    });

    it("Should stop matching rule if ruleNoRematch is used", async () => {
        let count = 1;
        const orig =
            <Adapt.Group>
                <Empty id={count} />
            </Adapt.Group>;
        const action = (props: Adapt.AnyProps, info: Adapt.StyleBuildInfo) => {
            should(props.children.props.id).equal(count);
            return Adapt.ruleNoRematch(info,
                <Adapt.Group>
                    <Empty id={++count} />
                </Adapt.Group>
            );
        };
        const fakes = [fake(action), fake(action), fake(action)];
        const styles =
            <Adapt.Style>
                {Adapt.Group} {Adapt.rule(fakes[0])}
                {Adapt.Group} {Adapt.rule(fakes[1])}
                {Adapt.Group} {Adapt.rule(fakes[2])}
            </Adapt.Style>;
        const { contents: dom } = await Adapt.buildOnce(orig, styles);
        if (dom == null) throw should(dom).not.Null();
        fakes.forEach((f, i) => {
            const msg = `Failed for fake[${i}]`;
            f.callCount.should.equal(1, msg);
        });
    });

    it("Should match root element", async () => {
        const orig =
            <Adapt.Group key="root">
                <Empty id={1} />
            </Adapt.Group>;
        const styles =
            <Adapt.Style>
                :root {Adapt.rule((props, info) => Adapt.ruleNoRematch(info,
                    <Empty id={2}>{props.children}</Empty>
                ))}
            </Adapt.Style>;

        const { contents: dom } = await Adapt.buildOnce(orig, styles);

        should(Adapt).not.Null();
        should(Adapt.isElement(dom)).True();
        const expected = deepFilterElemsToPublic(
            <Empty id={2} key="root-Empty">
                <Empty id={1} key="Empty" />
            </Empty>
        );
        should(deepFilterElemsToPublic(dom)).eql(expected);
    });

    it("Should replace root with a wrapper element", async () => {
        class Wrapper extends Adapt.PrimitiveComponent<{children: any}> { }
        const orig =
            <Adapt.Group key="root">
                <Empty id={1} />
            </Adapt.Group>;
        const styles =
            <Adapt.Style>
                :root:not({Wrapper}) {Adapt.rule((props) => (
                    <Wrapper key={props.key}>{props.children}</Wrapper>
                ))}
            </Adapt.Style>;

        const { contents: dom } = await Adapt.buildOnce(orig, styles);

        should(Adapt).not.Null();
        should(Adapt.isElement(dom)).True();
        const expected = deepFilterElemsToPublic(
            <Wrapper key="root">
                <Empty id={1} key="Empty" />
            </Wrapper>
        );
        should(deepFilterElemsToPublic(dom)).eql(expected);
    });

});

describe("DOM CSS find tests", () => {
    it("Should find elements by style", () => {
        const dom =
            <Adapt.Group>
                <MakeMakeEmpty id={1} />
                <Adapt.Group>
                    <MakeMakeEmpty id={2} />
                </Adapt.Group>
            </Adapt.Group>;

        const elems = Adapt.findElementsInDom(<Adapt.Style>{MakeMakeEmpty} {Adapt.rule()}</Adapt.Style>, dom);
        should(elems).eql([<MakeMakeEmpty id={1} />, <MakeMakeEmpty id={2} />]);
    });

    it("Should find paths by style", () => {
        const inner =
            <Adapt.Group>
                <MakeMakeEmpty id={2} />
            </Adapt.Group>;
        const dom =
            <Adapt.Group>
                <MakeMakeEmpty id={1} />
                {inner}
            </Adapt.Group>;

        const elems = Adapt.findPathsInDom(<Adapt.Style>{MakeMakeEmpty} {Adapt.rule()}</Adapt.Style>, dom);
        should(elems).eql([
            [dom, <MakeMakeEmpty id={1} />],
            [dom, inner, <MakeMakeEmpty id={2} />]
        ]);
    });

    it("Should search null DOM", () => {
        const paths = Adapt.findPathsInDom(<Adapt.Style>{MakeMakeEmpty} {Adapt.rule()}</Adapt.Style>, null);
        should(paths).empty();
        const elems = Adapt.findElementsInDom(<Adapt.Style>{MakeMakeEmpty} {Adapt.rule()}</Adapt.Style>, null);
        should(elems).empty();
    });

    it("Should not error in DOM with non-element children", async () => {
        class Foo extends Adapt.PrimitiveComponent<{children: any}> { }
        const orig =
            <Foo>
                {"string child"}
                <Empty id={11} />
                {() => 1}
            </Foo>;
        const res = await Adapt.buildOnce(orig, null);
        const dom = res.contents;
        if (dom == null) {
            should(dom).not.Null();
            return;
        }
        dom.componentType.should.equal(Foo);
        should(dom.props.children[0]).have.type("string");

        const rules = <Adapt.Style>{Empty} {Adapt.rule()}</Adapt.Style>;

        const els = Adapt.findElementsInDom(rules, dom);
        should(els).have.length(1);
        should(els[0].componentType).equal(Empty);
    });

});
