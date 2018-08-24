import Adapt, {
    Component,
    Group,
} from "../src";

import should = require("should");
import {
    deepFilterElemsToPublic,
    Empty
} from "./testlib";

interface GroupThenEmptyProps {
    id: number;
    witness: (state: GroupThenEmptyState) => void;
}
interface GroupThenEmptyState { didGroup: boolean; }

class GroupThenEmpty extends Component<GroupThenEmptyProps, GroupThenEmptyState> {
    readonly state: GroupThenEmptyState;

    constructor(props: GroupThenEmptyProps) {
        super(props);
        this.state = { didGroup: false };
    }

    build() {
        this.props.witness(this.state);
        if (this.state.didGroup) {
            return <Empty key={this.props.key} id={this.props.id} />;
        } else {
            this.setState({ didGroup: true });
            return <Group key={this.props.key} />;
        }
    }
}

describe("DOM Iterative Build Tests", () => {
    it("Should build empty primitive", async () => {
        const orig = <Adapt.Group key="root" />;
        const { contents: dom } = await Adapt.build(orig, null);

        const ref = deepFilterElemsToPublic(orig);

        should(dom).not.equal(orig);
        should(deepFilterElemsToPublic(dom)).eql(ref);
    });

    it("Should rebuild when state is updated", async () => {
        const id = 4;
        const states: GroupThenEmptyState[] = [];
        const orig = <GroupThenEmpty key="root" id={id} witness={(state) => states.push(state)} />;
        const { contents: dom } = await Adapt.build(orig, null);

        const ref = deepFilterElemsToPublic(<Empty key="root" id={id} />);
        should(states).eql([false, true].map((v) => ({ didGroup: v })));
        should(deepFilterElemsToPublic(dom)).eql(ref);
    });
});
