import Adapt, {
    BuildNotImplemented,
    Component,
    isElement,
    UnbsElementOrNull,
    WithChildren,
} from "../src";

import * as ld from "lodash";
import should = require("should");

import { DomError } from "../src/builtin_components";
import {
    checkChildComponents,
    Empty,
    MakeEmpty,
    MakeGroup,
    MakeMakeEmpty,
    WithDefaults
} from "./testlib";

interface AbstractProps extends WithChildren {
    id: number;
}
class Abstract extends Component<AbstractProps, {}> { }

const publicElementFields = {
    props: null,
    componentType: null
};

function deepFilterElemsToPublic(o: any): any {
    if (!ld.isObject(o)) return o;

    if (ld.isArray(o)) {
        return o.map((item) => deepFilterElemsToPublic(item));
    }

    if (isElement(o)) {
        const filtered = ld.pickBy(o, (value: any, key: string) => {
            return key in publicElementFields;
        });

        if (filtered.props != null) {
            (filtered as any).props = deepFilterElemsToPublic(filtered.props);
        }
        return filtered;
    }

    const ret: { [key: string]: any } = {};
    // tslint:disable-next-line:forin
    for (const key in o) {
        ret[key] = deepFilterElemsToPublic(o[key]);
    }
    return ret;
}

describe("DOM Basic Build Tests", () => {
    it("Should build empty primitive", () => {
        const orig = <Adapt.Group key="root"/>;
        const { contents: dom } = Adapt.build(orig, null);

        const ref = deepFilterElemsToPublic(orig);

        should(Adapt).not.Null();
        should(Adapt.isElement(dom)).True();
        should(dom).not.equal(orig);
        should(deepFilterElemsToPublic(dom)).eql(ref);
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
        const ref = deepFilterElemsToPublic([<Empty key="a" id={1} />, <Empty key="b" id={2} />]);
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
        function SFCThrows(_props: AbstractProps): UnbsElementOrNull {
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
});

describe("DOM Shallow Build Tests", () => {
    it("Should respect shallow option", () => {
        const body = <MakeEmpty id={1} />;
        const orig = <MakeGroup>{body}</MakeGroup>;
        const expected = <Adapt.Group>{body}</Adapt.Group>;

        const { contents: dom } = Adapt.build(orig, null, { shallow: true });
        if (dom == null) {
            should(dom).not.Null();
            return;
        }
        should(dom).eql(expected);
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
        const noChange = <Adapt.Group>
            <MakeEmpty id={1} />
        </Adapt.Group>;

        const orig = <Adapt.Group>
            {noChange}
            <MakeEmpty id={2} />
        </Adapt.Group>;

        const expected = <Adapt.Group>
            {noChange}
            <Empty id={2} />
        </Adapt.Group>;

        const { contents: dom } = Adapt.build(orig, null, { depth: 2 });
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
            const newDom = Adapt.build(dom, null, { depth: i });
            if (newDom == null) {
                break;
            }
            // tslint:disable-next-line:no-console
            console.log(Adapt.serializeDom(newDom));
        }
    }); */
});
