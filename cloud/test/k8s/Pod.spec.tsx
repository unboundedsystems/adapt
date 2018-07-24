import Adapt, { childrenToArray, DomError, isElement } from "@usys/adapt";
import * as ld from "lodash";
import * as should from "should";

import { Container, Pod } from "../../src/k8s";

describe("k8s Pod Component Tests", () => {
    it("Should Instantiate Pod", () => {
        const pod =
            <Pod name="test">
                <Container name="onlyContainer" image="node:latest" />
            </Pod>;

        should(pod).not.Undefined();
    });

    it("Should enforce unique container names", () => {
        const pod =
            <Pod name="test">
                <Container name="container" image="node:latest" />
                <Container name="dupContainer" image="node:latest" />
                <Container name="dupContainer" image="node:latest" />
            </Pod>;

        should(pod).not.Undefined();
        const { contents: dom } = Adapt.build(pod, null);
        if (dom == null) {
            should(dom).not.Null();
            return;
        }

        const kids = childrenToArray(dom.props.children);
        const err = ld.find(kids, (child) => {
            if (!isElement(child)) return false;
            if (child.componentType === DomError) return true;
            return false;
        });

        should(err).not.Undefined();
        if (!isElement(err)) {
            should(isElement(err)).True();
            return;
        }

        should(err.props.children).match(/dupContainer/);
    });

});
