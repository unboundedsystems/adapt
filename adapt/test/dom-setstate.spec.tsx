import * as should from "should";

import Adapt, { AnyState, Component, createStateStore, StateStore } from "../src";

import { Empty, MakeGroup } from "./testlib";

interface StateUpdaterProps {
    newState: any;
    initialState?: any;
    prevObserver?: (prev: any) => void;
    stateObserver?: (state: any) => void;
}

class StateUpdater extends Component<StateUpdaterProps, AnyState> {
    //Override protections from Component so constructor can write initialState.
    readonly state: any;

    constructor(props: StateUpdaterProps) {
        super(props);
        if (props.initialState != null) {
            this.state = props.initialState;
        }
    }

    build() {
        if (this.props.stateObserver != null) {
            this.props.stateObserver(this.state);
        }
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

        Adapt.buildOnce(dom, null, { stateStore: state });

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

        let previousState: any;
        let stateVar: any;
        const prevArgObserver = (prev: any) => { previousState = prev; };
        const stateObserver = (s: any) => { stateVar = s; };

        const dom = <StateUpdater
            key="root"
            newState={nextState}
            prevObserver={prevArgObserver}
            stateObserver={stateObserver} />;

        state.setElementState(["root"], prevState);
        Adapt.buildOnce(dom, null, { stateStore: state });
        const actual = state.elementState(["root"]);

        should(actual).eql(nextState);
        should(previousState).eql(prevState);
        should(stateVar).eql(prevState);
    });

    it("Should update state within DOM", () => {
        const newState = {
            elem1: "data1",
            elem2: "data2"
        };

        const dom =
            <MakeGroup key="root">
                <StateUpdater key="updater" newState={newState} />
            </MakeGroup>;

        Adapt.buildOnce(dom, null, { stateStore: state });

        const actual = state.elementState(["root", "root-Group", "updater"]);
        should(actual).eql(newState);
    });

    it("Should honor initial state from constructor", () => {
        const initialState = {
            elem: "data"
        };

        const nextState = {
            elem: "newData"
        };

        let previousState: any;
        const observer = (prev: any) => { previousState = prev; };

        const dom = <StateUpdater
            key="root"
            newState={nextState}
            initialState={initialState}
            prevObserver={observer} />;

        Adapt.buildOnce(dom, null, { stateStore: state });
        const actual = state.elementState(["root"]);

        should(actual).eql(nextState);
        should(previousState).eql(initialState);
    });
});
