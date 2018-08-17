import Adapt, {
    AdaptElementOrNull,
    BuildNotImplemented,
    Component,
    PrimitiveComponent,
    rule,
    Style,
    WithChildren,
} from "../src";

import should = require("should");

import { DomError } from "../src/builtin_components";
import {
    checkChildComponents,
    deepFilterElemsToPublic,
    Empty,
    MakeEmpty,
    MakeGroup,
    MakeMakeEmpty,
    WithDefaults
} from "./testlib";

interface AbstractProps extends WithChildren {
    id: number;
}
class Abstract extends Component<AbstractProps> {
    build(): never { throw new BuildNotImplemented(); }
}

class AlwaysErrorPrimitive extends PrimitiveComponent<{}> {
    validate() {
        return "Always error instantiated!";
    }
}

function ReturnsNull(_props: {}): AdaptElementOrNull {
    return null;
}

describe("DOM Basic Build Tests", () => {
    it("Should build empty primitive", () => {
        const orig = <Adapt.Group key="root" />;
        const { contents: dom } = Adapt.build(orig, null);

        const ref = deepFilterElemsToPublic(orig);

        should(Adapt).not.Null();
        should(Adapt.isElement(dom)).True();
        should(dom).not.equal(orig);
        should(deepFilterElemsToPublic(dom)).eql(ref);

        if (!Adapt.isMountedElement(dom)) {
            should(Adapt.isMountedElement(dom)).True();
            return;
        }

        should(dom.id).eql(JSON.stringify(["root"]));
    });

    it("Should validate primitive component", () => {
        const orig = <AlwaysErrorPrimitive key="root" />;
        const { contents: dom, messages } = Adapt.build(orig, null);

        should(Adapt.isElement(dom)).True();
        should(dom).not.equal(orig);
        if (dom == null) {
            should(dom).not.Null();
            return;
        }
        const domError = dom.props.children;
        if (domError == null) {
            should(domError).not.Null();
            should(domError).not.Undefined();
            return;
        }
        should(domError.componentType).equal(DomError);
        should(domError.props.children).match(/Always error instantiated/);
        should(messages[0].content).match(/Always error instantiated/);
    });

    it("Should build single child", () => {
        const orig = <MakeGroup>
            <Empty key="a" id={1} />
        </MakeGroup>;

        const { contents: dom } = Adapt.build(orig, null);
        if (dom == null) {
            should(dom).not.Null();
            return;
        }

        const ref = deepFilterElemsToPublic(<Empty key="a" id={1} />);
        should(dom.componentType).equal(Adapt.Group);
        should(deepFilterElemsToPublic(dom.props.children)).eql(ref);
    });

    it("Should substitute props.children as flat", () => {
        const orig = <MakeGroup>
            <Empty key="a" id={1} />
            <Empty key="b" id={2} />
        </MakeGroup>;

        const { contents: dom } = Adapt.build(orig, null);
        if (dom == null) {
            should(dom).not.Null();
            return;
        }

        const ref = deepFilterElemsToPublic([<Empty key="a" id={1} />, <Empty key="b" id={2} />]);
        should(dom.componentType).equal(Adapt.Group);
        should(deepFilterElemsToPublic(dom.props.children)).eql(ref);
    });

    it("Should build recursively", () => {
        const orig = <Adapt.Group>
            <MakeMakeEmpty key="a" id={1} />
            <MakeMakeEmpty key="b" id={2} />
        </Adapt.Group>;

        const { contents: dom } = Adapt.build(orig, null);
        if (dom == null) {
            should(dom).not.Null();
            return;
        }
        checkChildComponents(dom, Empty, Empty);
        const ref = deepFilterElemsToPublic([
            <Empty key="a-MakeEmpty-Empty" id={1} />,
            <Empty key="b-MakeEmpty-Empty" id={2} />]);
        should(deepFilterElemsToPublic(dom.props.children)).eql(ref);
    });

    it("Should pass through primitives with children", () => {
        const orig = <Adapt.Group>
            <Empty key="1" id={1} />
            <Empty key="2" id={2} />
        </Adapt.Group>;

        const { contents: dom } = Adapt.build(orig, null);
        if (dom == null) {
            should(dom).not.Null();
            return;
        }
        checkChildComponents(dom, Empty, Empty);
        const ref = deepFilterElemsToPublic([<Empty key="1" id={1} />, <Empty key="2" id={2} />]);
        should(deepFilterElemsToPublic(dom.props.children)).eql(ref);
    });

    it("Should use defaultProps", () => {
        const orig = <WithDefaults />;
        const { contents: dom } = Adapt.build(orig, null);
        if (dom == null) {
            should(dom).not.Null();
            return;
        }
        const ref = deepFilterElemsToPublic([<Empty key="1" id={100} />, <Empty key="2" id={200} />]);
        should(deepFilterElemsToPublic(dom.props.children)).eql(ref);
    });

    it("Should override defaultProps", () => {
        const orig = <WithDefaults prop1={1234} />;
        const { contents: dom } = Adapt.build(orig, null);
        if (dom == null) {
            should(dom).not.Null();
            return;
        }
        const ref = deepFilterElemsToPublic([<Empty key="1" id={1234} />, <Empty key="2" id={200} />]);
        should(deepFilterElemsToPublic(dom.props.children)).eql(ref);
    });

    it("Should insert DomError for abstract component", () => {
        const orig =
            <Abstract id={10}>
                <Empty id={11} />
            </Abstract>;
        const res = Adapt.build(orig, null);
        const dom = res.contents;
        if (dom == null) {
            should(dom).not.Null();
            return;
        }
        dom.componentType.should.equal(Abstract);
        checkChildComponents(dom, DomError, Empty);
        should(dom.props.id).equal(10);
        should(dom.props.children[0].props.children)
            .match(/Component Abstract cannot be built/);
    });

    it("Should insert DomError for SFC that throws BuildNotImplemented", () => {
        function SFCThrows(_props: AbstractProps): AdaptElementOrNull {
            throw new BuildNotImplemented();
        }
        const orig =
            <SFCThrows id={10}>
                <Empty id={11} />
            </SFCThrows>;
        const res = Adapt.build(orig, null);
        const dom = res.contents;
        if (dom == null) {
            should(dom).not.Null();
            return;
        }
        dom.componentType.should.equal(SFCThrows);
        checkChildComponents(dom, DomError, Empty);
        should(dom.props.id).equal(10);
        should(dom.props.children[0].props.children)
            .match(/Component SFCThrows cannot be built/);
    });

    it("Should build DOM that returns null", () => {
        const orig = <ReturnsNull />;
        const res = Adapt.build(orig, null);
        should(res.messages).have.length(0);
        should(res.contents).be.Null();
    });

    it("Should build DOM where style returns null", () => {
        const orig =
            <Abstract id={10}>
                <Empty id={11} />
            </Abstract>;
        const style =
            <Style>
                {Abstract} {rule(() => <ReturnsNull />)}
            </Style>;
        const res = Adapt.build(orig, style);
        should(res.messages).have.length(0);
        should(res.contents).be.Null();
    });
});

describe("DOM Shallow Build Tests", () => {
    it("Should respect shallow option", () => {
        const body = <MakeEmpty key="body" id={1} />;
        const orig = <MakeGroup key="orig">{body}</MakeGroup>;
        const expected = deepFilterElemsToPublic(<Adapt.Group key="orig-Group" >{body}</Adapt.Group>);

        const { contents: dom } = Adapt.build(orig, null, { shallow: true });
        if (dom == null) {
            should(dom).not.Null();
            return;
        }
        should(deepFilterElemsToPublic(dom)).eql(expected);
    });

    it("Should respect depth 0 as no-op", () => {
        const orig = <MakeMakeEmpty id={1} />;
        const { contents: dom } = Adapt.build(orig, null, { depth: 0 });
        if (dom == null) {
            should(dom).not.Null();
            return;
        }
        should(dom).eql(orig);
    });

    it("Should respect depth option", () => {
        const noChange = <Adapt.Group key="noChange">
            <MakeEmpty key="inner" id={1} />
        </Adapt.Group>;

        const orig = <Adapt.Group key="root">
            {noChange}
            <MakeEmpty key="outer" id={2} />
        </Adapt.Group>;

        const expected =
            deepFilterElemsToPublic(<Adapt.Group key="root">
                {noChange}
                <Empty key="outer-Empty" id={2} />
            </Adapt.Group>);

        const { contents: dom } = Adapt.build(orig, null, { depth: 2 });
        if (dom == null) {
            should(dom).not.Null();
            return;
        }
        should(deepFilterElemsToPublic(dom)).eql(expected);
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
            const newDom = Adapt.build(dom, null, { depth: i });
            if (newDom == null) {
                break;
            }
            // tslint:disable-next-line:no-console
            console.log(Adapt.serializeDom(newDom));
        }
    }); */
});
