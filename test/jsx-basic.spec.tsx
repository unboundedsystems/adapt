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

describe('JSX createElement Tests', () => {
    it('Element should construct', async () => {
        <unbs.Group />
    });

    it('Element should have the correct type', () => {
        const element = <unbs.Group />;
        should(unbs.isNode(element)).be.True();
    });
});


