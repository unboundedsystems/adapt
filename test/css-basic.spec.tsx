import * as unbs from '../src';
import * as css from '../src/css';

import * as should from 'should';

class Dummy extends unbs.PrimitiveComponent<unbs.AnyProps> { }
class Foo extends unbs.PrimitiveComponent<unbs.AnyProps> { }

describe('Selector Parsing', () => {
    it('Should Parse Tag Selector', () => {
        const styles = css.parseStyles([css.style("Foo", () => <Dummy />)]);
        should(styles.length).equal(1);
        should(styles[0].sfc({ buildOrig: () => null })).eql(<Dummy />);
    });
});

function pathToLeaf(elem: unbs.UnbsElement): unbs.UnbsElement[] {
    should(unbs.isElement(elem)).True();
    if ((elem.props.children == null) || (elem.props.children.length == 0)) {
        return [elem];
    }
    should(elem.props.children.length).equal(1);
    const path = pathToLeaf(elem.props.children[0]);
    path.unshift(elem);
    return path;
}

function testStylePath(style: css.RawStyle,
    matchPath: unbs.UnbsElement[] | null,
    noMatchPath: unbs.UnbsElement[] | null) {

    const styles = css.parseStyles([style]);
    const matcher = styles[0].match;

    if (matchPath != null) should(matcher(matchPath)).True();
    if (noMatchPath != null) should(matcher(noMatchPath)).False();
}

function testStyleDom(style: css.RawStyle,
    dom: unbs.UnbsElement | null,
    noMatchDom: unbs.UnbsElement | null) {

    const matchPath = dom == null ? null : pathToLeaf(dom);
    const noMatchPath = noMatchDom == null ? null : pathToLeaf(noMatchDom);
    testStylePath(style, matchPath, noMatchPath);
}

describe('Selector matching', () => {
    it('Should Match Single Tag', () => {
        testStylePath(
            css.style("Foo", () => null),
            [<Foo />],
            [<Dummy />]);
    });

    it('Should Match Child', () => {
        const style = css.style("Dummy > Foo", () => null);
        const dom = <Dummy><Foo /></Dummy>
        const matchPath = pathToLeaf(dom);
        const noMatchPath = [dom];
        testStylePath(style, matchPath, noMatchPath);
        testStylePath(style, null, [<Foo />]);
    });

    it('Should Match Descendant (direct single)', () => {
        const noMatchDom = <Foo />
        const dom = <Dummy><Foo /></Dummy>
        testStyleDom(css.style("Dummy Foo", () => null), dom, noMatchDom);

    });

    it('Should Match Descendant (transitive single)', () => {
        const noMatchDom =
            <unbs.Group>
                <unbs.Group>
                    <Foo />
                </unbs.Group>
            </unbs.Group>
        const dom = <Dummy>{noMatchDom}</Dummy>
        testStyleDom(css.style("Dummy Foo", () => null), dom, noMatchDom);
    });
});
