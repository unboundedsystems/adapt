import * as util from 'util';
import * as unbs from '../src';

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

function hasChildren(x: any): x is { children: unbs.UnbsNode[] } {
    return x.children != null;
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

    it('Should have the right children', () => {
        const element =
            <unbs.Group>
                <Dummy />
                <unbs.Group />
            </unbs.Group>;

        if (hasChildren(element.props)) {
            should(element.props.children).not.be.Null();
            should(element.props.children).be.Array();
            should(element.props.children.length).equal(2);


            const childComponents = element.props.children.map(
                (child: unbs.UnbsNode) => child.componentType);
            should(childComponents).eql([Dummy, unbs.Group]);
        } else {
            throw new Error("Element does not have children: "
                + util.inspect(element));
        }
    });
});


