// This file has some mock workflows that use this library to test
// interactions between features

import * as ld from "lodash";
import * as unbs from "../src";

// tslint:disable-next-line:no-duplicate-imports
import {
    build,
    cloneElement,
    isPrimitiveElement,
    serializeDom,
    Style,
    UnbsElement
} from "../src";
import MongoContainer from "./nodecellar_example/MongoContainer";
import Nodecellar from "./nodecellar_example/Nodecellar";

function buildLoop(initialState: any, root: UnbsElement, styles: UnbsElement | null): void {
    let state = ld.cloneDeep(initialState);
    let oldState = ld.cloneDeep(state);
    do {
        const newRoot = unbs.cloneElement(root, { store: state });
        const dom = build(newRoot, styles);
        // tslint:disable-next-line:no-console
        console.log("******************");
        if (dom != null) {
            // tslint:disable-next-line:no-console
            console.log(serializeDom(dom));
        } else {
            // tslint:disable-next-line:no-console
            console.log("null");
        }
        oldState = state;
        state = ld.cloneDeep(initialState);
        if ((dom != null) && isPrimitiveElement(dom)) {
            dom.updateState(state);
        }
    } while (!ld.isEqual(oldState, state));
}

//function DockerImage(props: any) { return null; }

describe("NodeCellar on K8S", () => {
    const style =
        <Style>
            {MongoContainer} {unbs.rule((props) => {
                return cloneElement(props.origElement, { name: "override_name", cssMatched: true });
            })}
        </Style>;

    it("Should Deploy", () => {
        buildLoop({}, <Nodecellar />, style);
    });
});
