import * as unbs from '../src';
import * as css from '../src/css';

import * as should from 'should';

class Dummy extends unbs.PrimitiveComponent<unbs.AnyProps> { }
class Foo extends unbs.PrimitiveComponent<unbs.AnyProps> { }

describe('Selector Parsing', () => {
    it('Should Parse Tag Selector', () => {
        const styles = css.parseStyles([css.style("Foo", () => <Dummy />)]);
        should(styles.length).equal(1);
        should(styles[0].sfc({})).eql(<Dummy />);
    });
});

describe('Selector matching', () => {
    it('Should Match Single Tag', () => {
        const styles = css.parseStyles([css.style("Foo", () => null)]);

        const matcher = styles[0].match;
        should(matcher([<Dummy />])).False();
        should(matcher([<Foo />])).True();
    });
});
