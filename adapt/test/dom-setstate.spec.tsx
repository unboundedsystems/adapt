import * as should from "should";

import Adapt, {
    AdaptElement,
    AnyState,
    Component,
    createStateStore,
    PrimitiveComponent,
    StateStore,
} from "../src";
import * as st from "../src/state";

import { Empty, MakeGroup } from "./testlib";

type Update = AnyState | st.StateUpdater;
interface StateUpdaterProps {
    initialState: any;
    updates: Update[];
    constructorStateObserver?: (state: any) => void;
    buildStartObserver?: (state: any) => void;
    buildEndObserver?: (state: any) => void;
    initialStateObserver?: () => void;
}

class StateUpdater extends Component<StateUpdaterProps, AnyState> {
    constructor(props: StateUpdaterProps) {
        super(props);
        if (props.constructorStateObserver != null) {
            props.constructorStateObserver(this.state);
        }
    }

    initialState() {
        if (this.props.initialStateObserver != null) {
            this.props.initialStateObserver();
        }
        return this.props.initialState;
    }

    build() {
        if (this.props.buildStartObserver != null) {
            this.props.buildStartObserver(this.state);
        }
        for (const u of this.props.updates) {
            this.setState(u);
        }
        if (this.props.buildEndObserver != null) {
            this.props.buildEndObserver(this.state);
        }
        return <Empty id={1} />;
    }
}

interface NoInitialStateProps {
    readTooEarly?: boolean;
    readState?: boolean;
    writeState?: boolean;
    setState?: boolean;
}

class NoInitialState extends Component<NoInitialStateProps, AnyState> {
    constructor(props: NoInitialStateProps) {
        // @ts-ignore - compiler doesn't allow you to touch this before super
        if (props.readTooEarly) this.state;
        super(props);
        if (props.readState) this.state;
        if (props.writeState) this.state = {a: 1};
        if (props.setState) this.setState({b: 2});
    }

    build() {
        return <Empty id={2}/>;
    }
}

interface PWSState {
    counter: number;
}
class PrimitiveWithState extends PrimitiveComponent<{}, PWSState> {
    constructor(props: {}) {
        super(props);
        this.setState((prev) => ({ counter: prev.counter + 1 }));
    }

    initialState() { return { counter: 0 }; }
}

describe("DOM setState Tests", () => {
    let state: StateStore;
    let buildStartState: any[];
    let buildEndState: any[];
    let previousState: any[];
    let ctorState: any[];
    let calledInitial: number;
    let defaultProps: StateUpdaterProps;

    beforeEach(() => {
        state = createStateStore();
        buildStartState = [];
        buildEndState = [];
        previousState = [];
        ctorState = [];
        calledInitial = 0;

        defaultProps = {
            initialState: {},
            buildStartObserver: (s) => { buildStartState.push(s); },
            buildEndObserver: (s) => { buildEndState.push(s); },
            constructorStateObserver: (s) => { ctorState.push(s); },
            initialStateObserver: () => { calledInitial++; },
            updates: [],
        };
    });

    function updater(nextState: AnyState): st.StateUpdater {
        return (prev) => {
            previousState.push(prev);
            return nextState;
        };
    }

    async function checkBuild(dom: AdaptElement) {
        const out = await Adapt.buildOnce(dom, null, { stateStore: state });
        should(out.messages).have.length(0, `Error messages during build`);
    }

    it("Should record state for single components", async () => {
        const initialState = {
            elem1: "data1",
            elem2: "data2"
        };

        const dom = <StateUpdater key="root" initialState={initialState} updates={[]} />;

        await checkBuild(dom);

        const actual = state.elementState(["root"]);
        should(actual).eql(initialState);
    });

    it("Should correctly send previous state", async () => {
        const prevState = {
            elem: "data"
        };

        const nextState = {
            elem: "newData"
        };

        const props = {
            ...defaultProps,
            initialState: prevState,
            updates: [ updater(nextState) ],
        };

        const dom = <StateUpdater key="root" {...props} />;

        state.setElementState(["root"], prevState);
        await checkBuild(dom);
        const actual = state.elementState(["root"]);

        should(ctorState).eql([prevState]);
        should(calledInitial).eql(0);
        should(actual).eql(nextState);
        should(previousState).eql([prevState]);
        should(buildStartState).eql([prevState]);
    });

    it("Should update state within DOM", async () => {
        const newState = {
            elem1: "data1",
            elem2: "data2"
        };
        const props = {
            ...defaultProps,
            updates: [ newState ],
        };

        const dom =
            <MakeGroup key="root">
                <StateUpdater key="updater" {...props} />
            </MakeGroup>;

        await checkBuild(dom);

        const actual = state.elementState(["root", "root-Group", "updater"]);
        should(actual).eql(newState);
    });

    it("Should honor initial state", async () => {
        const initialState = {
            elem: "data"
        };
        const nextState = {
            elem: "newData"
        };
        const props = {
            ...defaultProps,
            initialState,
            updates: [ updater(nextState) ],
        };

        const dom = <StateUpdater key="root" {...props} />;
        await checkBuild(dom);
        const actual = state.elementState(["root"]);

        should(actual).eql(nextState);
        should(previousState).eql([initialState]);
        should(ctorState).eql([initialState]);
        should(calledInitial).eql(1);
        should(buildStartState).eql([initialState]);
        should(buildEndState).eql(buildStartState);
    });

    it("Should remember state across builds", async () => {
        const initialState = {
            elem: "data"
        };
        const nextState = {
            elem: "newData"
        };
        const props = {
            ...defaultProps,
            initialState,
            updates: [ updater(nextState) ],
        };

        const dom = <StateUpdater key="root" {...props} />;
        await checkBuild(dom);

        let actual = state.elementState(["root"]);
        should(actual).eql(nextState);
        should(previousState).eql([initialState]);
        should(ctorState).eql([initialState]);
        should(calledInitial).eql(1);

        /* Second build */
        await checkBuild(dom);

        actual = state.elementState(["root"]);
        should(actual).eql(nextState);
        should(previousState).eql([initialState, nextState]);
        should(ctorState).eql([initialState, nextState]);
        should(calledInitial).eql(1);
    });

    it("Should perform updates in order", async () => {
        function cat(toAppend: string) {
            return (prev: {data: string}) => {
                prev.data = prev.data + toAppend;
                return prev;
            };
        }
        const initialState = { init: "yes" };
        const props = {
            ...defaultProps,
            initialState,
            updates: [
                { data: "1" },
                cat("2"),
                cat("3"),
                cat("4"),
            ]
        };
        const finalExpected = {
            init: "yes",
            data: "1234",
        };

        const dom = <StateUpdater key="root" {...props} />;
        await checkBuild(dom);

        const actual = state.elementState(["root"]);
        should(actual).eql(finalExpected);
        should(buildStartState).eql([initialState]);
        should(buildEndState).eql(buildStartState);
    });

    it("Should error if state read before super", async () => {
        const dom = <NoInitialState key="root" readTooEarly={true} />;

        const out = await Adapt.buildOnce(dom, null, { stateStore: state });

        should(out.messages).have.length(1);
        should(out.messages[0].content).match(
            RegExp("Component construction failed: Must call super constructor " +
                   "in derived class before accessing 'this'"));
    });

    it("Should error if state read without initialState", async () => {
        const dom = <NoInitialState key="root" readState={true} />;

        const out = await Adapt.buildOnce(dom, null, { stateStore: state });

        should(out.messages).have.length(1);
        should(out.messages[0].content).match(
            RegExp("Component construction failed: cannot access this.state in " +
                   "a Component that lacks an initialState method"));
    });

    it("Should error if this.state is written", async () => {
        const dom = <NoInitialState key="root" writeState={true} />;

        const out = await Adapt.buildOnce(dom, null, { stateStore: state });

        should(out.messages).have.length(1);
        should(out.messages[0].content).match(
            RegExp("Component construction failed: State for a component can " +
                   "only be changed by calling this.setState"));
    });

    it("Should error if setState called without initialState", async () => {
        const dom = <NoInitialState key="root" setState={true} />;

        const out = await Adapt.buildOnce(dom, null, { stateStore: state });

        should(out.messages).have.length(1);
        should(out.messages[0].content).match(
            RegExp("Component NoInitialState: cannot access this.setState in " +
                   "a Component that lacks an initialState method"));
    });

    it("Should allow PrimitiveComponent with state", async () => {
        const dom = <PrimitiveWithState key="root" />;

        await checkBuild(dom);
        let actual = state.elementState(["root"]);
        should(actual).eql({ counter: 1 });

        await checkBuild(dom);
        actual = state.elementState(["root"]);
        should(actual).eql({ counter: 2 });
    });
});
