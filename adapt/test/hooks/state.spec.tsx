import should from "should";

import Adapt, {
    AdaptElement,
    AnyState,
    createStateStore,
    StateStore,
    useState,
} from "../../src";
import { SetState } from "../../src/hooks/state";
import * as st from "../../src/state";

import { Empty, MakeGroup } from "../testlib";

type Update = [number, AnyState | st.StateUpdater];
interface Info {
    initialState: any;
    startObserver: (state: any) => void;
    endObserver: (state: any) => void;
    initialStateObserver: () => void;
}

interface StateUpdaterProps {
    updates: Update[];
    info: Info[];
}

interface Tracker {
    buildStartState: any[];
    buildEndState: any[];
    previousState: any[];
    calledInitial: number;
}

interface TestInfo {
    state: StateStore;
    props: StateUpdaterProps;
    trackers: Tracker[];
}

function StateUpdater(props: StateUpdaterProps) {
    const state: any[] = [];
    const setState: SetState<any>[] = [];

    for (const i of props.info) {
        const [ cur, setter ] = useState(() => {
            i.initialStateObserver();
            return i.initialState;
        });
        i.startObserver(cur);

        state.push(cur);
        setState.push(setter);
    }

    for (const u of props.updates) {
        const [ which, update ] = u;
        setState[which](update);
    }
    for (let i = 0; i < props.info.length; i++) {
        props.info[i].endObserver(state[i]);
    }
    return <Empty id={1} />;
}

describe("useState Tests", () => {
    let ti: TestInfo;

    function setup(init: any[]) {
        const state = createStateStore();
        const trackers: Tracker[] = [];
        const props: StateUpdaterProps = {
            updates: [],
            info: [],
        };
        for (const initialState of init) {
            const t: Tracker = {
                buildStartState: [],
                buildEndState: [],
                previousState: [],
                calledInitial: 0,
            };
            trackers.push(t);

            props.info.push({
                initialState,
                startObserver: (s) => { t.buildStartState.push(s); },
                endObserver: (s) => { t.buildEndState.push(s); },
                initialStateObserver: () => { t.calledInitial++; },
            });
        }
        ti = {
            state,
            props,
            trackers,
        };
        return ti;
    }

    function updater(which: number, nextState: any, merge = true): st.StateUpdater {
        return (prev) => {
            ti.trackers[which].previousState.push(prev);
            return merge ? { ...prev, ...nextState } : nextState;
        };
    }

    async function checkBuild(dom: AdaptElement) {
        const out = await Adapt.buildOnce(dom, null, { stateStore: ti.state });
        should(out.messages).have.length(0, `Error messages during build`);
    }

    it("Should record state for single components", async () => {
        const initialState = {
            elem1: "data1",
            elem2: "data2"
        };
        const { props, state } = setup([initialState]);

        const dom = <StateUpdater key="root" {...props} />;

        await checkBuild(dom);

        const actual = state.elementState(["root"]);
        if (actual === undefined) throw should(actual).not.be.Undefined();
        should(actual[0]).eql(initialState);
    });

    it("Should correctly send previous state", async () => {
        const prevState = {
            elem: "data"
        };

        const nextState = {
            elem: "newData"
        };

        const { props, state, trackers } = setup([prevState]);
        const t = trackers[0];
        props.updates.push([ 0, updater(0, nextState) ]);

        const dom = <StateUpdater key="root" {...props} />;

        state.setElementState(["root"], {0: prevState});
        await checkBuild(dom);
        const actual = state.elementState(["root"]);

        should(t.calledInitial).eql(0);
        if (actual === undefined) throw should(actual).not.be.Undefined();
        should(actual[0]).eql(nextState);
        should(t.previousState).eql([prevState]);
        should(t.buildStartState).eql([prevState]);
    });

    it("Should not merge objects", async () => {
        const prevState = {
            elem: "data"
        };

        const nextState = {
            notElem: "newData"
        };

        const { props, state, trackers } = setup([prevState]);
        const t = trackers[0];
        props.updates.push([ 0, nextState ]);

        const dom = <StateUpdater key="root" {...props} />;

        await checkBuild(dom);
        const actual = state.elementState(["root"]);

        should(t.calledInitial).eql(1);
        if (actual === undefined) throw should(actual).not.be.Undefined();
        should(actual[0]).eql(nextState);
        should(t.buildStartState).eql([prevState]);
    });

    it("Should update state within DOM", async () => {
        const newState = {
            elem1: "data1",
            elem2: "data2"
        };
        const { props, state } = setup([{}]);
        props.updates.push([ 0, newState ]);

        const dom =
            <MakeGroup key="root">
                <StateUpdater key="updater" {...props} />
            </MakeGroup>;

        await checkBuild(dom);

        const actual = state.elementState(["root", "root-Group", "updater"]);
        if (actual === undefined) throw should(actual).not.be.Undefined();
        should(actual[0]).eql(newState);
    });

    it("Should honor initial state", async () => {
        const initialState = {
            elem: "data"
        };
        const nextState = {
            elem: "newData"
        };
        const { props, state, trackers } = setup([initialState]);
        const t = trackers[0];
        props.updates.push([ 0, updater(0, nextState) ]);

        const dom = <StateUpdater key="root" {...props} />;
        await checkBuild(dom);
        const actual = state.elementState(["root"]);

        if (actual === undefined) throw should(actual).not.be.Undefined();
        should(actual[0]).eql(nextState);
        should(t.previousState).eql([initialState]);
        should(t.calledInitial).eql(1);
        should(t.buildStartState).eql([initialState]);
        should(t.buildEndState).eql(t.buildStartState);
    });

    it("Should remember state across builds", async () => {
        const initialState = {
            elem: "data"
        };
        const nextState = {
            elem: "newData"
        };
        const { props, state, trackers } = setup([initialState]);
        const t = trackers[0];
        props.updates.push([ 0, updater(0, nextState) ]);

        const dom = <StateUpdater key="root" {...props} />;
        await checkBuild(dom);

        let actual = state.elementState(["root"]);
        if (actual === undefined) throw should(actual).not.be.Undefined();
        should(actual[0]).eql(nextState);
        should(t.previousState).eql([initialState]);
        should(t.calledInitial).eql(1);

        /* Second build */
        await checkBuild(dom);

        actual = state.elementState(["root"]);
        if (actual === undefined) throw should(actual).not.be.Undefined();
        should(actual[0]).eql(nextState);
        should(t.previousState).eql([initialState, nextState]);
        should(t.calledInitial).eql(1);
    });

    it("Should perform updates in order", async () => {
        function cat(toAppend: string) {
            return (prev: {data: string}) => {
                prev.data = prev.data + toAppend;
                return prev;
            };
        }
        const initialState = { init: "yes" };
        const { props, state, trackers } = setup([initialState]);
        const t = trackers[0];
        props.updates.push(
            [ 0, updater(0, { data: "1" }) ],
            [ 0, cat("2") ],
            [ 0, cat("3") ],
            [ 0, cat("4") ],
        );
        const finalExpected = {
            init: "yes",
            data: "1234",
        };

        const dom = <StateUpdater key="root" {...props} />;
        await checkBuild(dom);

        const actual = state.elementState(["root"]);
        if (actual === undefined) throw should(actual).not.be.Undefined();
        should(actual[0]).eql(finalExpected);
        should(t.buildStartState).eql([initialState]);
        should(t.buildEndState).eql(t.buildStartState);
    });

    it("Should handle multiple useState calls", async () => {
        const initialStates = [
            "zero",
            "one",
            "two",
        ];
        const { props, state, trackers: t } = setup(initialStates);
        props.updates.push(
            [ 1, updater(1, "one update", false) ],
            [ 0, updater(0, "zero update", false) ],
        );

        const dom = <StateUpdater key="root" {...props} />;
        await checkBuild(dom);
        const actual = state.elementState(["root"]);

        if (actual === undefined) throw should(actual).not.be.Undefined();

        should(actual[0]).eql("zero update");
        should(t[0].previousState).eql([initialStates[0]]);
        should(t[0].calledInitial).eql(1);
        should(t[0].buildStartState).eql([initialStates[0]]);
        should(t[0].buildEndState).eql(t[0].buildStartState);

        should(actual[1]).eql("one update");
        should(t[1].previousState).eql([initialStates[1]]);
        should(t[1].calledInitial).eql(1);
        should(t[1].buildStartState).eql([initialStates[1]]);
        should(t[1].buildEndState).eql(t[1].buildStartState);

        should(actual[2]).eql("two");
        should(t[2].previousState).eql([]);
        should(t[2].calledInitial).eql(1);
        should(t[2].buildStartState).eql([initialStates[2]]);
        should(t[2].buildEndState).eql(t[2].buildStartState);
    });
});
