import * as should from "should";

import Adapt, { Component, createStateStore, StateStore } from "../src";

import { Empty } from "./testlib";

interface StateUpdaterProps {
    newState: any;
    prevObserver?: (prev: any) => void;
}

class StateUpdater extends Component<StateUpdaterProps, any> {
    build() {
        this.setState((prev: any, props) => {
            if (this.props.prevObserver != null) {
                this.props.prevObserver(prev);
            }
            return this.props.newState;
        });
        return <Empty id={1} />;
    }
}

describe("DOM setState Tests", () => {
    let state: StateStore;

    beforeEach(() => {
        state = createStateStore();
    });

    it("Should record state for single components", () => {
        const newState = {
            elem1: "data1",
            elem2: "data2"
        };

        const dom = <StateUpdater key="root" newState={newState} />;

        Adapt.build(dom, null, { stateStore: state });

        const actual = state.elementState(["root"]);
        should(actual).eql(newState);
    });

    it("Should correctly send previous state", () => {
        const prevState = {
            elem: "data"
        };

        const nextState = {
            elem: "newData"
        };

        let previousState: any = null;
        const observer = (prev: any) => { previousState = prev; };

        const dom = <StateUpdater
            key="root"
            newState={nextState}
            prevObserver={observer} />;

        state.setElementState(["root"], prevState);
        Adapt.build(dom, null, { stateStore: state });
        const actual = state.elementState(["root"]);

        should(actual).eql(nextState);
        should(previousState).eql(prevState);
    });
});
