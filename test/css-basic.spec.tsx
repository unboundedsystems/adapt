import * as unbs from "../src";
import * as css from "../src/css";

import * as should from "should";

class Dummy extends unbs.PrimitiveComponent<unbs.AnyProps> { }
class Foo extends unbs.PrimitiveComponent<unbs.AnyProps> { }

describe("Selector Parsing", () => {
    it("Should Parse Tag Selector", () => {
        const styleTag = <css.Style>{Foo} {css.rule(() => <Dummy />)}</css.Style>;
        const styles = css.buildStyles(styleTag);
        should(styles.length).equal(1);
        const info = {
            origBuild: () => null,
            origElement: null,
        };
        should(styles[0].sfc({}, info)).eql(<Dummy />);
    });
});

function pathToLeaf(elem: unbs.UnbsElement): unbs.UnbsElement[] {
    should(unbs.isElement(elem)).True();
    if ((elem.props.children == null) || (elem.props.children.length === 0)) {
        return [elem];
    }
    should(elem.props.children.length).equal(1);
    const path = pathToLeaf(elem.props.children[0]);
    path.unshift(elem);
    return path;
}

function testStylePath(style: unbs.UnbsElement,
    matchPath: unbs.UnbsElement[] | null,
    noMatchPath: unbs.UnbsElement[] | null) {

    const styles = css.buildStyles(style);
    const matcher = styles[0].match;

    if (matchPath != null) should(matcher(matchPath)).True();
    if (noMatchPath != null) should(matcher(noMatchPath)).False();
}

function testStyleDom(style: unbs.UnbsElement,
    dom: unbs.UnbsElement | null,
    noMatchDom: unbs.UnbsElement | null) {

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
            <unbs.Group>
                <unbs.Group>
                    <Foo />
                </unbs.Group>
            </unbs.Group>;
        const dom = <Dummy>{noMatchDom}</Dummy>;
        testStyleDom(<css.Style>
            {Dummy} {Foo} {css.rule(() => null)}
        </css.Style>, dom, noMatchDom);
    });
});

describe("concatStyles", () => {
    it("Should return empty rules", () => {
        const noRules = <css.Style>{[]}</css.Style>;

        let ret = css.concatStyles();
        should(ret).not.be.Null();
        ret.componentType.should.equal(css.Style);
        should(ret.props.children).be.Undefined();

        ret = css.concatStyles(noRules);
        should(ret).not.be.Null();
        ret.componentType.should.equal(css.Style);
        should(ret.props.children).be.Undefined();
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
