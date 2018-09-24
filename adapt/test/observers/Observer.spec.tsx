import * as ld from "lodash";
import * as should from "should";
import Adapt from "../../src";
import { createObserverManagerDeployment, gql } from "../../src/observers";
import { MockObserver } from "../../src/observers/mock_observer";
import { Observer } from "../../src/observers/Observer";
import { deepFilterElemsToPublic, Empty } from "../testlib";
import { RotatingPayloadTestObserver, TestObserver } from "./test_observer";

describe("Observer Component Tests", () => {
    it("Should build with no observations", async () => {
        const observerPlugin = new MockObserver();
        const mgr = createObserverManagerDeployment();
        const observations = await observerPlugin.observe([]);
        mgr.registerSchema("mock", observerPlugin.schema, observations);

        const root =
            <Observer<{ mockById: { id: string } }>
                observerName="mock"
                query={gql`query Test { mockById(id: "1") { id }}`}
                build={(err, props) => {
                    if (err) return <Empty key="error" id={200} />;
                    if (props === undefined) return <Empty key="dummy" id={100} />;
                    return <Empty key="dummy" id={Number(props.mockById.id)} />;
                }} />;

        const { contents: dom, messages } = await Adapt.build(root, null, { observerManager: mgr });
        should(messages).empty();
        should(dom).not.Null();
        should(deepFilterElemsToPublic(dom)).eql(deepFilterElemsToPublic(<Empty key="dummy" id={100} />));
    });

    it("Should build with observations", async () => {
        const observerPlugin = new TestObserver();
        const mgr = createObserverManagerDeployment();
        const observations = await observerPlugin.observe();
        mgr.registerSchema("test", observerPlugin.schema, observations);
        let sawUndefinedProps = false;

        const root =
            <Observer
                observerName="test"
                query={gql`query Test { fooById(id: "1") { id } }`}
                build={(err, props) => {
                    if (err) {
                        return <Empty key="err" id={3} />;
                    }
                    if (props) {
                        return <Empty key="props" id={2} />;
                    } else {
                        sawUndefinedProps = true;
                        return <Empty key="default" id={1} />;
                    }
                }} />;

        const { contents: dom, messages } = await Adapt.build(root, null, { observerManager: mgr });
        should(messages).empty();
        should(dom).not.Null();
        should(deepFilterElemsToPublic(dom)).eql(deepFilterElemsToPublic(<Empty key="props" id={2} />));
        should(sawUndefinedProps).True();
    });

    it("Should build with default comparator", async () => {
        const observerPlugin = new RotatingPayloadTestObserver();
        const mgr = createObserverManagerDeployment();
        const observations = await observerPlugin.observe();
        mgr.registerSchema("test", observerPlugin.schema, observations);

        const root =
            <Observer
                observerName="test"
                query={gql`query Test { fooById(id: "1") { id }}`}
                build={(error, props) => {
                    return <Empty key="dummy" id={1} />;
                }} />;

        //This should not infinite loop
        const { contents: dom, messages } = await Adapt.build(root, null, { observerManager: mgr });
        should(messages).empty();
        should(dom).not.Null();
        should(deepFilterElemsToPublic(dom)).eql(deepFilterElemsToPublic(<Empty key="dummy" id={1} />));
    });

    it("Should build with custom comparator", async () => {
        const observerPlugin = new RotatingPayloadTestObserver();
        const mgr = createObserverManagerDeployment();
        const observations = await observerPlugin.observe();
        mgr.registerSchema("test", observerPlugin.schema, observations);

        let differentData = false;
        let compareCount = 0;
        const root =
            <Observer<{ fooById: { id: string, payload: string[] } }>
                observerName="test"
                query={gql`query Test { fooById(id: "1") { id, payload }}`}
                isEqual={(x, y) => {
                    compareCount++;
                    if (x.data && y.data) {
                        //This also tests the RotatingPayloadTestObserver
                        if (!ld.isEqual(x.data, y.data)) differentData = true;
                    }
                    if (compareCount <= 1) {
                        return ld.isEqual(x, y);
                    }
                    return Observer.defaultProps.isEqual(x, y);
                }}
                build={() => {
                    return <Empty key="dummy" id={1} />;
                }} />;

        //This should not infinite loop
        const { contents: dom, messages } = await Adapt.build(root, null, { observerManager: mgr });
        should(messages).empty();
        should(dom).not.Null();
        should(deepFilterElemsToPublic(dom)).eql(deepFilterElemsToPublic(<Empty key="dummy" id={1} />));
        should(differentData).True();
    });
});
