import * as unbs from '../src'

class SvlsFunction extends unbs.Component<{}> {
    constructor(props: {}) {
        super(props);
    }

    build(): unbs.UnbsNode {
        return <unbs.Group></unbs.Group>
    }
}

describe('JSX createElement Tests', () => {
    it('Should construct an element', async () => {
        <unbs.Group />
    });
});


