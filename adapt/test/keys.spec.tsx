import * as should from "should";
import { fake } from "sinon";

import Adapt, {
    build,
    Group,
    isPrimitiveElement,
    PrimitiveComponent,
    WithChildren,
} from "../src";
import {
    assignKeys,
    KeyTracker,
    UpdateStateInfo,
} from "../src/keys";
import {
    Empty,
} from "./testlib";

interface NodeNameSpyProps extends WithChildren {
    spy: any;
}

class NodeNameSpy extends PrimitiveComponent<NodeNameSpyProps, {}> {
    updateState(_state: any, info: UpdateStateInfo) {
        this.props.spy(info.nodeName);
    }
}

describe("Assign Keys", () => {
    it("Should generate needed keys", () => {
        const tree = <Group>
            <Empty id={1} />
            <Empty id={2} />
        </Group>;

        assignKeys(tree.props.children);
        should(tree.props.children[0].props.key).equal("Empty");
        should(tree.props.children[1].props.key).equal("Empty1");
    });

    it("Should not overwrite keys", () => {
        const tree = <Group>
            <Empty key="userDef" id={1} />
            <Empty id={2} />
        </Group>;

        assignKeys(tree.props.children);
        should(tree.props.children[0].props.key).equal("userDef");
        should(tree.props.children[1].props.key).equal("Empty");
    });

    it("Should assign singleton child key", () => {
        const tree = <Group>
            <Empty id={2} />
        </Group>;

        assignKeys(tree.props.children);
        should(tree.props.children.props.key).equal("Empty");
    });
});

describe("KeyTracker", () => {
    it("Should generate unique keys for a base name", () => {
        const tracker = new KeyTracker();
        const comp = new Empty({ id: 1 });

        tracker.addKey(comp); // Depth 0
        tracker.lastKeyPath().should.equal("Empty");
        tracker.pathPush();
        tracker.addKey(comp); // Depth 1
        tracker.lastKeyPath().should.equal("Empty.Empty");
        tracker.addKey(comp); // Depth 1
        tracker.lastKeyPath().should.equal("Empty.Empty1");
        tracker.pathPop();

        tracker.addKey(comp); // Depth 0
        tracker.lastKeyPath().should.equal("Empty1");
        tracker.pathPush();
        tracker.addKey(comp); // Depth 1
        tracker.lastKeyPath().should.equal("Empty1.Empty");
    });
});

describe("UpdateStateInfo", () => {
    it("Should generate unique keys for DOM traversal", () => {
        const spy = fake();
        const orig =
            <Group>
                <NodeNameSpy spy={spy}>
                    <NodeNameSpy spy={spy} />
                    <NodeNameSpy spy={spy} />
                </NodeNameSpy>
                <NodeNameSpy spy={spy}>
                    <NodeNameSpy spy={spy} />
                    <NodeNameSpy spy={spy} />
                </NodeNameSpy>
            </Group>;
        const { contents: dom } = build(orig, null);

        const keys = new KeyTracker();
        const info = new UpdateStateInfo(keys);
        if (dom == null) {
            should(dom).not.be.Null();
            return;
        }
        isPrimitiveElement(dom).should.be.True();
        if (!isPrimitiveElement(dom)) return;

        dom.updateState({}, keys, info);

        const names = spy.args.map((args: any[]) => {
            return args[0];
        });

        names.should.eql([
            "Group.NodeNameSpy",
            "Group.NodeNameSpy.NodeNameSpy",
            "Group.NodeNameSpy.NodeNameSpy1",
            "Group.NodeNameSpy1",
            "Group.NodeNameSpy1.NodeNameSpy",
            "Group.NodeNameSpy1.NodeNameSpy1",
        ]);
    });
});
