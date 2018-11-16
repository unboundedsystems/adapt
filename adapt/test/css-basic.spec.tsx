import * as Adapt from "../src";
import * as css from "../src/css";

import should from "should";

class Dummy extends Adapt.PrimitiveComponent<Adapt.AnyProps> { }
class Foo extends Adapt.PrimitiveComponent<Adapt.AnyProps> { }

describe("Selector Parsing", () => {
    it("Should Parse Tag Selector", () => {
        const styleTag = <css.Style>{Foo} {css.rule(() => <Dummy />)}</css.Style>;
        const styles = css.buildStyles(styleTag);
        should(styles.length).equal(1);
        const info = {
            origBuild: () => null,
            origElement: null,
        };
        should(styles[0].sfc({handle: Adapt.handle()}, info)).eql(<Dummy />);
    });
});

function pathToLeaf(elem: Adapt.AdaptElement): Adapt.AdaptElement[] {
    should(Adapt.isElement(elem)).True();
    if ((elem.props.children == null) || (elem.props.children.length === 0)) {
        return [elem];
    }
    should(elem.props.children).not.Array();
    const path = pathToLeaf(elem.props.children);
    path.unshift(elem);
    return path;
}

function testStylePath(style: Adapt.AdaptElement,
    matchPath: Adapt.AdaptElement[] | null,
    noMatchPath: Adapt.AdaptElement[] | null) {

    const styles = css.buildStyles(style);
    const matcher = styles[0].match;

    if (matchPath != null) should(matcher(matchPath)).True();
    if (noMatchPath != null) should(matcher(noMatchPath)).False();
}

function testStyleDom(style: Adapt.AdaptElement,
    dom: Adapt.AdaptElement | null,
    noMatchDom: Adapt.AdaptElement | null) {

    const matchPath = dom == null ? null : pathToLeaf(dom);
    const noMatchPath = noMatchDom == null ? null : pathToLeaf(noMatchDom);
    testStylePath(style, matchPath, noMatchPath);
}

describe("Selector matching", () => {
    it("Should Match Single Tag", () => {
        testStylePath(
            <css.Style>{Foo} {css.rule(() => null)}</css.Style>,
            [<Foo />],
            [<Dummy />]);
    });

    it("Should Match Child", () => {
        const style = <css.Style>{Dummy} > {Foo} {css.rule(() => null)}</css.Style>;
        const dom = <Dummy><Foo /></Dummy>;
        const matchPath = pathToLeaf(dom);
        const noMatchPath = [dom];
        testStylePath(style, matchPath, noMatchPath);
        testStylePath(style, null, [<Foo />]);
    });

    it("Should Match Descendant (direct single)", () => {
        const noMatchDom = <Foo />;
        const dom = <Dummy><Foo /></Dummy>;
        testStyleDom(<css.Style>
            {Dummy} {Foo} {css.rule(() => null)}
        </css.Style>, dom, noMatchDom);

    });

    it("Should Match Descendant (transitive single)", () => {
        const noMatchDom =
            <Adapt.Group>
                <Adapt.Group>
                    <Foo />
                </Adapt.Group>
            </Adapt.Group>;
        const dom = <Dummy>{noMatchDom}</Dummy>;
        testStyleDom(<css.Style>
            {Dummy} {Foo} {css.rule(() => null)}
        </css.Style>, dom, noMatchDom);
    });

    it("Should distinguish identical names", () => {
        const outerFooDom = <Adapt.Group><Foo /></Adapt.Group>;
        const outerStyle =
            <css.Style>
                {Adapt.Group} {Foo} {css.rule(() => null)}
            </css.Style>;
        {
            // tslint:disable-next-line:no-shadowed-variable
            function Foo() { return null; }
            const innerFooDom = <Adapt.Group><Foo /></Adapt.Group>;
            testStyleDom(<css.Style>
                {Adapt.Group} {Foo} {css.rule(() => null)}
            </css.Style>, innerFooDom, outerFooDom);
            testStyleDom(outerStyle, outerFooDom, innerFooDom);
        }
    });

    it("Should match :root", () => {
        const style = <css.Style>:root {css.rule(() => null)}</css.Style>;
        const matchDom = <Dummy/>;
        const noMatchDom = <Adapt.Group><Dummy/></Adapt.Group>;
        testStyleDom(style, matchDom, noMatchDom);
    });

    it("Should not match :root as descendant", () => {
        const style = <css.Style>{Dummy} :root {Dummy} {css.rule(() => null)}</css.Style>;
        const noMatchDom = <Dummy id="1"><Dummy id="2"><Dummy id="3"></Dummy></Dummy></Dummy>;
        testStyleDom(style, null, noMatchDom);
    });

    it("Should not match :root as child", () => {
        const style = <css.Style>{Dummy} > :root {css.rule(() => null)}</css.Style>;
        const noMatchDom = <Dummy id="1"><Dummy id="2"><Dummy id="3"></Dummy></Dummy></Dummy>;
        testStyleDom(style, null, noMatchDom);
    });

    it("Should match :not(element)", () => {
        const style = <css.Style>:not({Dummy}) {css.rule(() => null)}</css.Style>;
        testStylePath(style, [<Foo />], [<Dummy />]);
    });

    it("Should error on :not without parens", () => {
        const style = <css.Style>:not{css.rule(() => null)}</css.Style>;
        const matchDom = <Dummy/>;
        should(() => testStyleDom(style, matchDom, null)).throwError(/requires at least one selector/);
    });

    it("Should error on :not with no args", () => {
        const style = <css.Style>:not(){css.rule(() => null)}</css.Style>;
        const matchDom = <Dummy/>;
        should(() => testStyleDom(style, matchDom, null)).throwError(/requires at least one selector/);
    });

    it("Should match :not(element, element)", () => {
        const style = <css.Style>:not({Dummy},{Adapt.Group}) {css.rule(() => null)}</css.Style>;
        testStylePath(style, [<Foo />], [<Dummy />]);
        testStylePath(style, null, [<Adapt.Group />]);
    });

    it("Should match attribute exists", () => {
        const style = <css.Style>{Dummy}[here] {css.rule(() => null)}</css.Style>;
        const matchDom = <Dummy here="hi" />;
        const noMatchDom = <Dummy />;
        testStyleDom(style, matchDom, noMatchDom);
    });

    it("Should match attribute equals", () => {
        testStyleDom(
            <css.Style>{Dummy}[here="hi"] {css.rule(() => null)}</css.Style>,
            <Dummy here="hi" />,  // match
            <Dummy here="hill" /> // no match
        );
        // An attribute value without quotes is still treated as a string
        testStyleDom(
            <css.Style>{Dummy}[here=1] {css.rule(() => null)}</css.Style>,
            <Dummy here="1" />,  // match
            <Dummy here={1} />   // no match
        );
    });

    it("Should match attribute start", () => {
        testStyleDom(
            <css.Style>{Dummy}[here^="hi"] {css.rule(() => null)}</css.Style>,
            <Dummy here="hill" />,  // match
            <Dummy here="ahill" />  // no match
        );
    });

    it("Should match attribute end", () => {
        testStyleDom(
            <css.Style>{Dummy}[here$="hi"] {css.rule(() => null)}</css.Style>,
            <Dummy here="lohi" />,  // match
            <Dummy here="hilo" />   // no match
        );
    });

    it("Should match attribute any (substring)", () => {
        testStyleDom(
            <css.Style>{Dummy}[here*="hi"] {css.rule(() => null)}</css.Style>,
            <Dummy here="chilly" />, // match
            <Dummy here="warm" />    // no match
        );
    });

    it("Should match attribute tilde", () => {
        testStyleDom(
            <css.Style>{Dummy}[here~="hi"] {css.rule(() => null)}</css.Style>,
            <Dummy here="low medium hi max" />, // match
            <Dummy here="low high" />           // no match
        );
    });
});

describe("concatStyles", () => {
    it("Should return empty rules", () => {
        const noRules = <css.Style>{[]}</css.Style>;

        let ret = css.concatStyles();
        should(ret).not.be.Null();
        ret.componentType.should.equal(css.Style);
        should(ret.props.children).Undefined();

        ret = css.concatStyles(noRules);
        should(ret).not.be.Null();
        ret.componentType.should.equal(css.Style);
        should(ret.props.children).Undefined();
    });

    it("Should concat rules", () => {
        const rule1 =
            <css.Style>
                {Foo} {css.rule(() => null)}
            </css.Style>;
        const rule2 =
            <css.Style>
                {Dummy} {css.rule(() => null)}
            </css.Style>;
        const ruleInstance = new css.Rule(() => null);

        const ret = css.concatStyles(rule1, rule2);
        should(ret).not.be.Null();
        ret.componentType.should.equal(css.Style);

        should(ret.props.children).not.be.Undefined();
        ret.props.children.should.eql([
            Foo, " ", ruleInstance,
            Dummy, " ", ruleInstance,
        ]);
    });
});
