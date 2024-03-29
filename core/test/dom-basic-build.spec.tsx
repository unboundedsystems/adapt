/*
 * Copyright 2018-2019 Unbounded Systems, LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import Adapt, {
    AdaptElement,
    AdaptElementOrNull,
    AnyProps,
    BuildHelpers,
    BuildNotImplemented,
    childrenToArray,
    Component,
    DeferredComponent,
    isMountedElement,
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

class Flex extends PrimitiveComponent<AnyProps> { }

interface DeferredFlexProps extends AnyProps {
    recordChildren?(children: undefined | AdaptElement | AdaptElement[]): void;
}

class DeferredFlex extends DeferredComponent<DeferredFlexProps> {
    build() {
        if (this.props.recordChildren) {
            this.props.recordChildren(this.props.children);
        }
        return <Flex>{this.props.children}</Flex>;
    }
}

class NonDeferredFlex extends Component<DeferredFlexProps> {
    build() {
        if (this.props.recordChildren) {
            this.props.recordChildren(this.props.children);
        }
        return <Flex>{this.props.children}</Flex>;
    }
}

function ReturnsNull(_props: {}): AdaptElementOrNull {
    return null;
}

class GetHelpers extends Component<{ f: (helpers: BuildHelpers) => void }> {
    build(helpers: BuildHelpers) {
        this.props.f(helpers);
        return null;
    }
}

describe("DOM Basic Build Tests", () => {
    it("Should build empty primitive", async () => {
        const orig = <Adapt.Group key="root" />;
        const { mountedOrig, contents: dom, buildErr, partialBuild } =
            await Adapt.buildOnce(orig, null);

        should(buildErr).be.False();
        should(partialBuild).be.False();
        const ref = deepFilterElemsToPublic(orig);

        should(Adapt).not.Null();
        should(Adapt.isElement(dom)).True();
        should(dom).not.equal(orig);
        should(deepFilterElemsToPublic(dom)).eql(ref);
        should(Adapt.isMountedElement(mountedOrig)).True();
        should(deepFilterElemsToPublic(mountedOrig)).eql(ref);

        if (!Adapt.isMountedElement(dom)) {
            should(Adapt.isMountedElement(dom)).True();
            return;
        }

        should(dom.id).eql(JSON.stringify(["root"]));
        should(await dom.status()).eql({ noStatus: "element has no children" });
        if (mountedOrig === null) throw should(mountedOrig).not.Null();
        should(mountedOrig.buildData.successor).Undefined();
    });

    it("Should validate primitive component", async () => {
        const orig = <AlwaysErrorPrimitive key="root" />;
        const { contents: dom, messages, buildErr, partialBuild } =
            await Adapt.buildOnce(orig, null);

        should(buildErr).be.True();
        should(partialBuild).be.True();
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

    it("Should build single child", async () => {
        const orig = <MakeGroup key="root">
            <Empty key="a" id={1} />
        </MakeGroup>;

        const { mountedOrig, contents: dom, buildErr, partialBuild } =
            await Adapt.buildOnce(orig, null);

        should(buildErr).be.False();
        should(partialBuild).be.False();
        if (dom == null) {
            should(dom).not.Null();
            return;
        }

        const mountedOrigRef = deepFilterElemsToPublic(<MakeGroup key="root">
            <Empty key="a" id={1} />
        </MakeGroup>);
        should(deepFilterElemsToPublic(mountedOrig)).eql(mountedOrigRef);

        const ref = deepFilterElemsToPublic(<Empty key="a" id={1} />);
        should(dom.componentType).equal(Adapt.Group);
        should(deepFilterElemsToPublic(dom.props.children)).eql(ref);
        should(await dom.status()).eql({ childStatus: [{ noStatus: "element has no children" }] });

        if (mountedOrig === null) throw should(mountedOrig).not.Null();
        const succRef = deepFilterElemsToPublic(<Adapt.Group key="root-Group"><Empty key="a" id={1} /></Adapt.Group>);
        should(deepFilterElemsToPublic(mountedOrig.buildData.successor)).eql(succRef);
    });

    it("Should substitute props.children as flat", async () => {
        const orig = <MakeGroup>
            <Empty key="a" id={1} />
            <Empty key="b" id={2} />
        </MakeGroup>;

        const { contents: dom, buildErr, partialBuild } =
            await Adapt.buildOnce(orig, null);
        should(buildErr).be.False();
        should(partialBuild).be.False();
        if (dom == null) {
            should(dom).not.Null();
            return;
        }

        const ref = deepFilterElemsToPublic([<Empty key="a" id={1} />, <Empty key="b" id={2} />]);
        should(dom.componentType).equal(Adapt.Group);
        should(deepFilterElemsToPublic(dom.props.children)).eql(ref);
        should(await dom.status()).eql({
            childStatus: [
                { noStatus: "element has no children" },
                { noStatus: "element has no children" }
            ]
        });
    });

    it("Should supply correct deployID", async () => {
        let helpers: BuildHelpers | undefined;
        const orig = <GetHelpers f={(h) => { helpers = h; }} />;
        await Adapt.buildOnce(orig, null, { deployID: "Whee!" });
        if (helpers === undefined) throw should(helpers).not.Undefined();
        should(helpers.deployID).equal("Whee!");
    });

    it("Should build recursively (outer primitive)", async () => {
        const orig = <Adapt.Group key="root">
            <MakeMakeEmpty key="a" id={1} />
            <MakeMakeEmpty key="b" id={2} />
        </Adapt.Group>;

        const { mountedOrig, contents: dom, buildErr, partialBuild } =
            await Adapt.buildOnce(orig, null);
        should(buildErr).be.False();
        should(partialBuild).be.False();
        if (dom == null) {
            should(dom).not.Null();
            return;
        }
        checkChildComponents(dom, Empty, Empty);
        const ref = deepFilterElemsToPublic([
            <Empty key="a-MakeEmpty-Empty" id={1} />,
            <Empty key="b-MakeEmpty-Empty" id={2} />]);
        should(deepFilterElemsToPublic(dom.props.children)).eql(ref);

        const origRef = deepFilterElemsToPublic(<Adapt.Group key="root">
            <Empty key="a-MakeEmpty-Empty" id={1} />
            <Empty key="b-MakeEmpty-Empty" id={2} />
        </Adapt.Group>);
        should(Adapt.isMountedElement(mountedOrig)).True();
        should(deepFilterElemsToPublic(mountedOrig)).eql(origRef);
    });

    it("Should build recursively (outer composite)", async () => {
        const orig = <MakeGroup key="root">
            <MakeMakeEmpty key="a" id={1} />
            <MakeMakeEmpty key="b" id={2} />
        </MakeGroup>;

        const { mountedOrig, contents: dom, buildErr, partialBuild } =
            await Adapt.buildOnce(orig, null);
        should(buildErr).be.False();
        should(partialBuild).be.False();
        if (dom == null) {
            should(dom).not.Null();
            return;
        }
        checkChildComponents(dom, Empty, Empty);
        const ref = deepFilterElemsToPublic([
            <Empty key="a-MakeEmpty-Empty" id={1} />,
            <Empty key="b-MakeEmpty-Empty" id={2} />]);
        should(deepFilterElemsToPublic(dom.props.children)).eql(ref);

        should(Adapt.isMountedElement(mountedOrig)).True();
        should(deepFilterElemsToPublic(mountedOrig)).eql(deepFilterElemsToPublic(orig));

        if (mountedOrig === null) throw should(mountedOrig).not.Null();
        const succ = mountedOrig.buildData.successor;
        if (!succ) throw should(succ).not.Undefined();

        const origChildren = succ.buildData.origChildren;
        if (!origChildren) throw should(origChildren).not.Undefined();

        const child0 = origChildren[0];
        if (!isMountedElement(child0)) throw should(isMountedElement(child0)).True();
        should(deepFilterElemsToPublic(child0)).eql(deepFilterElemsToPublic(<MakeMakeEmpty key="a" id={1} />));

        const succRef1 = deepFilterElemsToPublic(<MakeEmpty key="a-MakeEmpty" id={1} />);
        const succRef2 = deepFilterElemsToPublic(<Empty key="a-MakeEmpty-Empty" id={1} />);

        const child0Succ = child0.buildData.successor;
        if (child0Succ === undefined) throw should(child0Succ).not.Undefined();
        if (child0Succ === null) throw should(child0Succ).not.Null();
        should(deepFilterElemsToPublic(child0Succ)).eql(succRef1);
        should(deepFilterElemsToPublic(child0Succ.buildData.successor)).eql(succRef2);
    });

    it("Should pass through primitives with children", async () => {
        const orig = <Adapt.Group>
            <Empty key="1" id={1} />
            <Empty key="2" id={2} />
        </Adapt.Group>;

        const { contents: dom, buildErr, partialBuild } =
            await Adapt.buildOnce(orig, null);
        should(buildErr).be.False();
        should(partialBuild).be.False();
        if (dom == null) {
            should(dom).not.Null();
            return;
        }
        checkChildComponents(dom, Empty, Empty);
        const ref = deepFilterElemsToPublic([<Empty key="1" id={1} />, <Empty key="2" id={2} />]);
        should(deepFilterElemsToPublic(dom.props.children)).eql(ref);
    });

    it("Should build deferred component with no children", async () => {
        const orig = <Adapt.Group>
            <DeferredFlex key="1" />
        </Adapt.Group>;

        const { contents: dom, buildErr, partialBuild } =
            await Adapt.buildOnce(orig, null);
        should(buildErr).be.False();
        should(partialBuild).be.False();
        if (dom == null) {
            should(dom).not.Null();
            return;
        }
        checkChildComponents(dom, Flex);
        const ref = deepFilterElemsToPublic(<Flex key="1-Flex" />);
        should(deepFilterElemsToPublic(dom.props.children)).eql(ref);
    });

    it("Should build deferred component with children", async () => {
        let origChild: AdaptElement[] = [];
        const orig = <Adapt.Group>
            <DeferredFlex key="1" recordChildren={(children) => { origChild = childrenToArray(children); }}>
                <MakeEmpty key="a" id={1} />
            </DeferredFlex>
        </Adapt.Group>;

        const { contents: dom, buildErr, partialBuild } =
            await Adapt.buildOnce(orig, null);
        should(buildErr).be.False();
        should(partialBuild).be.False();
        if (dom == null) {
            should(dom).not.Null();
            return;
        }
        checkChildComponents(dom, Flex);
        const child = <Empty key="a-Empty" id={1} />;
        const ref = deepFilterElemsToPublic(
            <Flex key="1-Flex">
                {child}
            </Flex>);
        should(deepFilterElemsToPublic(origChild)).eql(deepFilterElemsToPublic([child]));
        should(deepFilterElemsToPublic(dom.props.children)).eql(ref);
    });

    it("Should build nested deferred components", async () => {
        let outerOrigChild: AdaptElement[] = [];
        let origChild: AdaptElement[] = [];
        const orig = <Adapt.Group>
            <DeferredFlex key="outer" recordChildren={(children) => { outerOrigChild = childrenToArray(children); }}>
                <DeferredFlex key="1" recordChildren={(children) => { origChild = childrenToArray(children); }}>
                    <MakeEmpty key="a" id={1} />
                </DeferredFlex>
            </DeferredFlex>
        </Adapt.Group>;

        const { contents: dom, buildErr, partialBuild } =
            await Adapt.buildOnce(orig, null);
        should(buildErr).be.False();
        should(partialBuild).be.False();
        if (dom == null) {
            should(dom).not.Null();
            return;
        }
        checkChildComponents(dom, Flex);
        const child = <Empty key="a-Empty" id={1} />;
        const outerChild = <Flex key="1-Flex">
            {child}
        </Flex>;
        should(deepFilterElemsToPublic(outerOrigChild)).eql(deepFilterElemsToPublic([outerChild]));
        should(deepFilterElemsToPublic(origChild)).eql(deepFilterElemsToPublic([child]));
    });

    it("Should build non-deferred component before children", async () => {
        let recordedChild: AdaptElement[] = [];
        const child = <MakeEmpty key="a" id={1} />;
        const orig = <Adapt.Group>
            <NonDeferredFlex key="1" recordChildren={(children) => { recordedChild = childrenToArray(children); }}>
                {child}
            </NonDeferredFlex>
        </Adapt.Group>;

        const { contents: dom, buildErr, partialBuild } =
            await Adapt.buildOnce(orig, null);
        should(buildErr).be.False();
        should(partialBuild).be.False();
        if (dom == null) {
            should(dom).not.Null();
            return;
        }
        checkChildComponents(dom, Flex);

        const ref = deepFilterElemsToPublic(
            <Flex key="1-Flex">
                <Empty key="a-Empty" id={1} />
            </Flex>);
        should(deepFilterElemsToPublic(recordedChild)).eql(deepFilterElemsToPublic([child]));
        should(deepFilterElemsToPublic(dom.props.children)).eql(ref);
    });

    it("Should use defaultProps", async () => {
        const orig = <WithDefaults />;
        const { contents: dom } = await Adapt.buildOnce(orig, null);
        if (dom == null) {
            should(dom).not.Null();
            return;
        }
        const ref = deepFilterElemsToPublic([<Empty key="1" id={100} />, <Empty key="2" id={200} />]);
        should(deepFilterElemsToPublic(dom.props.children)).eql(ref);
    });

    it("Should override defaultProps", async () => {
        const orig = <WithDefaults prop1={1234} />;
        const { contents: dom } = await Adapt.buildOnce(orig, null);
        if (dom == null) {
            should(dom).not.Null();
            return;
        }
        const ref = deepFilterElemsToPublic([<Empty key="1" id={1234} />, <Empty key="2" id={200} />]);
        should(deepFilterElemsToPublic(dom.props.children)).eql(ref);
    });

    it("Should insert DomError for abstract component", async () => {
        const orig =
            <Abstract id={10}>
                <Empty id={11} />
            </Abstract>;
        const res = await Adapt.buildOnce(orig, null);
        should(res.buildErr).be.True();
        should(res.partialBuild).be.True();
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

    it("Should insert DomError for SFC that throws BuildNotImplemented", async () => {
        function SFCThrows(_props: AbstractProps): AdaptElementOrNull {
            throw new BuildNotImplemented();
        }
        const orig =
            <SFCThrows id={10}>
                <Empty id={11} />
            </SFCThrows>;
        const res = await Adapt.buildOnce(orig, null);
        should(res.buildErr).be.True();
        should(res.partialBuild).be.True();
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

    it("Should build DOM that returns null", async () => {
        const orig = <ReturnsNull />;
        const res = await Adapt.buildOnce(orig, null);
        should(res.buildErr).be.False();
        should(res.partialBuild).be.False();
        should(res.messages).have.length(0);
        should(res.contents).be.Null();
    });

    it("Should build DOM where style returns null", async () => {
        const orig =
            <Abstract id={10}>
                <Empty id={11} />
            </Abstract>;
        const style =
            <Style>
                {Abstract} {rule(() => <ReturnsNull />)}
            </Style>;
        const res = await Adapt.buildOnce(orig, style);
        should(res.buildErr).be.False();
        should(res.partialBuild).be.False();
        should(res.messages).have.length(0);
        should(res.contents).be.Null();
    });
});

describe("DOM Shallow Build Tests", () => {
    it("Should respect shallow option", async () => {
        const body = <MakeEmpty key="body" id={1} />;
        const orig = <MakeGroup key="orig">{body}</MakeGroup>;
        const expected = deepFilterElemsToPublic(<Adapt.Group key="orig-Group" >{body}</Adapt.Group>);

        const { contents: dom, buildErr, partialBuild } =
            await Adapt.buildOnce(orig, null, { shallow: true });
        if (dom == null) {
            should(dom).not.Null();
            return;
        }
        should(partialBuild).be.True();
        should(buildErr).be.False();
        should(deepFilterElemsToPublic(dom)).eql(expected);
    });

    it("Should not allow depth 0 builds", async () => {
        const orig = <Adapt.Group />;
        return should(Adapt.buildOnce(orig, null, { depth: 0 })).rejectedWith(/depth cannot be 0/);
    });

    it("Should respect depth option", async () => {
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

        const { contents: dom, buildErr, partialBuild } =
            await Adapt.buildOnce(orig, null, { depth: 2 });
        if (dom == null) {
            should(dom).not.Null();
            return;
        }
        should(partialBuild).be.True();
        should(buildErr).be.False();
        should(deepFilterElemsToPublic(dom)).eql(expected);
    });
});
