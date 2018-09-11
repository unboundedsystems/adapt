import * as should from "should";
import Adapt from "../../src";
import { createObserverManagerDeployment, gql } from "../../src/observers";
import { Observer } from "../../src/observers/Observer";
import { deepFilterElemsToPublic, Empty } from "../testlib";
import { TestObserver } from "./test_observer";

describe("Observer Component Tests", () => {
    it("Should build with no observations", async () => {
        const observerPlugin = new TestObserver();
        const mgr = createObserverManagerDeployment();
        const observations = await observerPlugin.observe();
        mgr.registerSchema("test", observerPlugin.schema, observations);

        const root =
            <Observer
                observerName="test"
                environment={{
                    observerManager: mgr
                }}
                query={gql`query Test { fooById(id: "1") { id }}`}
                build={() => {
                    return <Empty key="dummy" id={1} />;
                }} />;

        const { contents: dom, messages } = await Adapt.build(root, null);
        should(messages).empty();
        should(dom).not.Null();
        should(deepFilterElemsToPublic(dom)).eql(deepFilterElemsToPublic(<Empty key="dummy" id={1} />));
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
                environment={{
                    observerManager: mgr
                }}
                query={gql`query Test { fooById(id: "1") { id } }`}
                build={(err, props: { id: string }) => {
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

        const { contents: dom, messages } = await Adapt.build(root, null);
        should(messages).empty();
        should(dom).not.Null();
        should(deepFilterElemsToPublic(dom)).eql(deepFilterElemsToPublic(<Empty key="props" id={2} />));
        should(sawUndefinedProps).True();
    });
});
