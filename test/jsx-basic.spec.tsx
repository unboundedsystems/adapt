///<reference type=should>
import * as unbs from '../src'
import should = require('should');

class SvlsFunction extends unbs.Component<{}> {
    constructor(props: {}) {
        super(props);
    }

    build(): unbs.UnbsNode {
        return <unbs.Group></unbs.Group>
    }
}

class Dummy extends unbs.Component<unbs.AnyProps> {
    constructor(props: unbs.AnyProps) {
        super(props);
    }

    build(): never {
        throw new Error("Cannot build Dummy component");
    }
}

describe('JSX createElement Tests', () => {
    it('Element should construct', async () => {
        <unbs.Group />
    });

    it('Element should have the correct type', () => {
        const element = <unbs.Group />;
        should(unbs.isNode(element)).be.True();
    });

    it('Element should have the correct componentType', () => {
        const element = <unbs.Group />;
        should(element.componentType === unbs.Group);
    });

    it('Should have the right props', () => {
        const element = <Dummy x={1} y="foo" />
        should(element.props).eql({ x: 1, y: "foo" });
    });

    /* it('Should have the right children', () => {
        const element =
            <unbs.Group>
                <Dummy />
                <unbs.Group />
            </unbs.Group>;

        should(element.props.children.length).equal(2);
    }); */
});


