import * as should from "should";
import unbs, { build, createContext, Group } from "../src";

import { Empty } from "./testlib";

describe("Context basic tests", () => {
    it("Consumer should get default value", () => {
        // tslint:disable-next-line:variable-name
        const TestContext = createContext(11);
        const orig =
            <TestContext.Consumer>
                { (val) => <Empty id={val} /> }
            </TestContext.Consumer>;

        const { contents: dom } = build(orig, null);
        if (dom == null) {
            should(dom).not.Null();
            return;
        }
        should(dom.componentType).equal(Empty);
        should(dom).eql(<Empty id={11} />);
    });

    it("Consumer should get Provider value", () => {
        // tslint:disable-next-line:variable-name
        const TestContext = createContext(11);
        const orig =
            <TestContext.Provider value={201} >
                <TestContext.Consumer>
                    { (val) => <Empty id={val} /> }
                </TestContext.Consumer>
            </TestContext.Provider>;

        const { contents: dom } = build(orig, null);
        if (dom == null) {
            should(dom).not.Null();
            return;
        }
        should(dom.componentType).equal(Group);
        should(dom).eql(<Group><Empty id={201} /></Group>);
    });

    it("Consumers should get different Provider values", () => {
        // tslint:disable-next-line:variable-name
        const TestContext = createContext(11);
        const orig =
            <Group>
                <TestContext.Provider value={101} >
                    <TestContext.Provider value={201} >
                        <TestContext.Consumer>
                            { (val) => <Empty id={val} /> }
                        </TestContext.Consumer>
                    </TestContext.Provider>
                    <TestContext.Consumer>
                        { (val) => <Empty id={val} /> }
                    </TestContext.Consumer>
                </TestContext.Provider>
                <TestContext.Consumer>
                    { (val) => <Empty id={val} /> }
                </TestContext.Consumer>
            </Group>;

        const { contents: dom } = build(orig, null);
        if (dom == null) {
            should(dom).not.Null();
            return;
        }
        should(dom.componentType).equal(Group);
        should(dom).eql(
            <Group>
                <Group>
                    <Group>
                        <Empty id={201} />
                    </Group>
                    <Empty id={101} />
                </Group>
                <Empty id={11} />
            </Group>
        );
    });

});
