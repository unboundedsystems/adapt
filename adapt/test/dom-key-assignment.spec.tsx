import * as should from "should";

import Adapt, { Group } from "../src";
import { childrenToArray, isElement } from "../src/jsx";
import { Empty, MakeEmpty, MakeMakeEmpty } from "./testlib";

class Dummy extends Adapt.Component<{}, {}> { }

function checkChildKeys(element: Adapt.UnbsElement, refKeys: string[]) {
    if (element.props.children == null) {
        should(refKeys).eql([]);
        return;
    }

    const children = childrenToArray(element.props.children);
    let i = 0;
    for (const child in children) {
        if (isElement(child)) {
            should(child.props.key).equal(refKeys[i]);
            i++;
        }
    }
}

describe("DOM Key Assignment Tests", () => {
    it("Should assign key to root", () => {
        const root = <Group />;
        const { contents: dom } = Adapt.build(root, null);
        if (dom == null) {
            should(dom).not.Null();
            return;
        }
        should(dom.props.key).equal("Group");
    });

    it("Should assign keys to children by node type", () => {
        const root =
            <Group>
                <Empty id={0} />
                <Empty id={1} />
                <Dummy />
                <Dummy />
                <Empty id={2} />
                <Dummy />
            </Group>;

        const { contents: dom } = Adapt.build(root, null);

        if (dom == null) {
            should(dom).not.Null();
            return;
        }
        should(dom.props.key).equal("Group");
        const childKeys = ["Empty", "Empty1", "Dummy", "Dummy1", "Empty2", "Dummy2"];
        checkChildKeys(dom, childKeys);
    });

    it("Should only assign keys if not set by user", () => {
        const root =
            <Group>
                <Empty id={0} />
                <Empty key="Hello" id={1} />
                <Empty id={2} />
            </Group>;

        const { contents: dom } = Adapt.build(root, null);

        if (dom == null) {
            should(dom).not.Null();
            return;
        }
        should(dom.props.key).equal("Group");
        const childKeys = ["Empty", "Hello", "Empty1"];
        checkChildKeys(dom, childKeys);
    });

    it("Should propagate key on recursive build", () => {
        const root =
            <Group>
                <MakeMakeEmpty id={0} />
                <MakeEmpty key="Hello" id={1} />
                <Empty id={2} />
            </Group>;

        const { contents: dom } = Adapt.build(root, null);

        if (dom == null) {
            should(dom).not.Null();
            return;
        }
        should(dom.props.key).equal("Group");
        const childKeys = ["MakeMakeEmpty", "Hello", "Empty1"];
        checkChildKeys(dom, childKeys);
    });
});
