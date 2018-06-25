import * as should from "should";
import Adapt, { build, createContext, Group } from "../src";

import { DomError } from "../src/builtin_components";
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
        should(dom).eql(<Empty id={201} />);
    });

    it("Consumers should get different Provider values", () => {
        // tslint:disable-next-line:variable-name
        const TestContext = createContext(11);
        const orig =
            <Group>
                <TestContext.Provider value={101} >
                    <Group>
                        <TestContext.Provider value={201} >
                            <TestContext.Consumer>
                                { (val) => <Empty id={val} /> }
                            </TestContext.Consumer>
                        </TestContext.Provider>
                        <TestContext.Consumer>
                            { (val) => <Empty id={val} /> }
                        </TestContext.Consumer>
                    </Group>
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
        should(dom).eql(
            <Group>
                <Group>
                    <Empty id={201} />
                    <Empty id={101} />
                </Group>
                <Empty id={11} />
            </Group>
        );
    });

    it("Should error if Provider has more than one child", () => {
        // tslint:disable-next-line:variable-name
        const TestContext = createContext(1);
        const orig =
            // @ts-ignore
            <TestContext.Provider value={2}>
                <Empty id={1} />
                <Empty id={2} />
            </TestContext.Provider>;
        const { contents: dom } = build(orig, null);
        if (dom == null) {
            should(dom).not.Null();
            return;
        }
        should(dom).eql(
            // @ts-ignore
            <TestContext.Provider value={2}>
                <DomError>Component Provider cannot be built with current
                    props: A context Provider may only have a single child</DomError>
                <Empty id={1} />
                <Empty id={2} />
            </TestContext.Provider>
        );
    });

    it("Should error if Consumer has more than one child", () => {
        // tslint:disable-next-line:variable-name
        const TestContext = createContext(1);
        const orig =
            // @ts-ignore
            <TestContext.Consumer value={2}>
                <Empty id={1} />
                <Empty id={2} />
            </TestContext.Consumer>;
        const { contents: dom } = build(orig, null);
        if (dom == null) {
            should(dom).not.Null();
            return;
        }
        should(dom).eql(
            // @ts-ignore
            <TestContext.Consumer value={2}>
                <DomError>Component Consumer cannot be built with current
                    props: Children of a context Consumer must be a single function</DomError>
                <Empty id={1} />
                <Empty id={2} />
            </TestContext.Consumer>
        );
    });
});
