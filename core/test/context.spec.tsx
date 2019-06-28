import should from "should";
import Adapt, { AdaptElement, buildOnce, createContext, Group, useContext } from "../src";
import { ConsumerProps } from "../src/context";
import { ComponentType } from "../src/jsx";

import { DomError } from "../src/builtin_components";
import { deepFilterElemsToPublic, Empty } from "./testlib";

describe("Context basic tests", () => {
    buildConsumerTestSuite((context) => context.Consumer);

    it("Should error if Provider has more than one child", async () => {
        // tslint:disable-next-line:variable-name
        const TestContext = createContext(1);
        const orig =
            // @ts-ignore
            <TestContext.Provider value={2}>
                <Empty id={1} />
                <Empty id={2} />
            </TestContext.Provider>;
        const { contents: dom } = await buildOnce(orig, null);
        if (dom == null) {
            should(dom).not.Null();
            return;
        }
        const expected = deepFilterElemsToPublic(
            // @ts-ignore
            <TestContext.Provider key="Provider" value={2}>
                <DomError>Component Provider cannot be built with current
                    props: A context Provider may only have a single child,
                    which must be a Component or SFC</DomError>
                <Empty id={1} />
                <Empty id={2} />
            </TestContext.Provider>);
        should(deepFilterElemsToPublic(dom)).eql(expected);
    });

    it("Should error if Consumer has more than one child", async () => {
        // tslint:disable-next-line:variable-name
        const TestContext = createContext(1);
        const orig =
            // @ts-ignore
            <TestContext.Consumer value={2}>
                <Empty id={1} />
                <Empty id={2} />
            </TestContext.Consumer>;
        const { contents: dom } = await buildOnce(orig, null);
        if (dom == null) {
            should(dom).not.Null();
            return;
        }
        const expected = deepFilterElemsToPublic(
            // @ts-ignore
            <TestContext.Consumer key="Consumer" value={2}>
                <DomError>Component Consumer cannot be built with current
                    props: Children of a context Consumer must be a single function</DomError>
                <Empty id={1} />
                <Empty id={2} />
            </TestContext.Consumer>);
        should(deepFilterElemsToPublic(dom)).eql(expected);
    });

    it("Should pass key through Provider", async () => {
        // tslint:disable-next-line:variable-name
        const TestContext = createContext(1);
        const orig =
            <TestContext.Provider key="mykey" value={1} >
                <Empty id={1} />
            </TestContext.Provider>;
        const { contents: dom } = await buildOnce(orig, null);
        if (dom == null) throw should(dom).not.Null();

        const expected = deepFilterElemsToPublic(<Empty key="mykey" id={1} />);
        should(deepFilterElemsToPublic(dom)).eql(expected);
    });

    it("Should pass key through two Providers", async () => {
        // tslint:disable-next-line:variable-name
        const TestContext = createContext(1);
        const orig =
            <TestContext.Provider key="mykey" value={1} >
                <TestContext.Provider value={2} >
                    <Empty id={1} />
                </TestContext.Provider>
            </TestContext.Provider>;
        const { contents: dom } = await buildOnce(orig, null);
        if (dom == null) throw should(dom).not.Null();

        const expected = deepFilterElemsToPublic(<Empty key="mykey" id={1} />);
        should(deepFilterElemsToPublic(dom)).eql(expected);
    });

    it("Should not override existing key", async () => {
        // tslint:disable-next-line:variable-name
        const TestContext = createContext(1);
        const orig =
            <TestContext.Provider key="mykey" value={1} >
                <Empty id={1} key="donttouch" />
            </TestContext.Provider>;
        const { contents: dom } = await buildOnce(orig, null);
        if (dom == null) throw should(dom).not.Null();

        const expected = deepFilterElemsToPublic(<Empty key="donttouch" id={1} />);
        should(deepFilterElemsToPublic(dom)).eql(expected);
    });
});

describe("useContext tests", () => {
    function hookConsumer(context: Adapt.Context<number>):
        (props: ConsumerProps<number>) => AdaptElement | null {
        // tslint:disable-next-line:variable-name
        const Consumer = (props: ConsumerProps<number>) => {
            const val = useContext(context);
            return props.children(val);
        };
        return Consumer;
    }

    buildConsumerTestSuite((context) => hookConsumer(context));
});

function buildConsumerTestSuite(consumer: (context: Adapt.Context<number>) => ComponentType<ConsumerProps<number>>) {
    it("Consumer should get default value", async () => {
        // tslint:disable-next-line:variable-name
        const TestContext = createContext(11);
        // tslint:disable-next-line:variable-name
        const Consumer = consumer(TestContext);
        const orig =
            <Consumer>
                {(val) => <Empty id={val} />}
            </Consumer>;

        const { contents: dom } = await buildOnce(orig, null);
        if (dom == null) {
            should(dom).not.Null();
            return;
        }
        should(dom.componentType).equal(Empty);
        const expected = deepFilterElemsToPublic(<Empty key="Consumer-Empty" id={11} />);
        should(deepFilterElemsToPublic(dom)).eql(expected);
    });

    it("Consumer should get Provider value", async () => {
        // tslint:disable-next-line:variable-name
        const TestContext = createContext(11);
        // tslint:disable-next-line:variable-name
        const Consumer = consumer(TestContext);
        const orig =
            <TestContext.Provider value={201} >
                <Consumer>
                    {(val) => <Empty id={val} />}
                </Consumer>
            </TestContext.Provider>;

        const { contents: dom } = await buildOnce(orig, null);
        if (dom == null) {
            should(dom).not.Null();
            return;
        }
        const expected = deepFilterElemsToPublic(<Empty key="Provider-Consumer-Empty" id={201} />);
        should(deepFilterElemsToPublic(dom)).eql(expected);
    });

    it("Consumers should get different Provider values", async () => {
        // tslint:disable-next-line:variable-name
        const TestContext = createContext(11);
        // tslint:disable-next-line:variable-name
        const Consumer = consumer(TestContext);
        const orig =
            <Group>
                <TestContext.Provider value={101} >
                    <Group>
                        <TestContext.Provider value={201} >
                            <Consumer>
                                {(val) => <Empty id={val} />}
                            </Consumer>
                        </TestContext.Provider>
                        <Consumer>
                            {(val) => <Empty id={val} />}
                        </Consumer>
                    </Group>
                </TestContext.Provider>
                <Consumer>
                    {(val) => <Empty id={val} />}
                </Consumer>
            </Group>;

        const { contents: dom } = await buildOnce(orig, null);
        if (dom == null) {
            should(dom).not.Null();
            return;
        }

        const expected = deepFilterElemsToPublic(
            <Group key="Group">
                <Group key="Provider-Group">
                    <Empty key="Provider-Consumer-Empty" id={201} />
                    <Empty key="Consumer-Empty" id={101} />
                </Group>
                <Empty key="Consumer-Empty" id={11} />
            </Group>);
        should(deepFilterElemsToPublic(dom)).eql(expected);
    });
}
