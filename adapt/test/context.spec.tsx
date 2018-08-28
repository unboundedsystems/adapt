import * as should from "should";
import Adapt, { buildOnce, createContext, Group } from "../src";

import { DomError } from "../src/builtin_components";
import { deepFilterElemsToPublic, Empty } from "./testlib";

describe("Context basic tests", () => {
    it("Consumer should get default value", () => {
        // tslint:disable-next-line:variable-name
        const TestContext = createContext(11);
        const orig =
            <TestContext.Consumer>
                {(val) => <Empty id={val} />}
            </TestContext.Consumer>;

        const { contents: dom } = buildOnce(orig, null);
        if (dom == null) {
            should(dom).not.Null();
            return;
        }
        should(dom.componentType).equal(Empty);
        const expected = deepFilterElemsToPublic(<Empty key="Consumer-Empty" id={11} />);
        should(deepFilterElemsToPublic(dom)).eql(expected);
    });

    it("Consumer should get Provider value", () => {
        // tslint:disable-next-line:variable-name
        const TestContext = createContext(11);
        const orig =
            <TestContext.Provider value={201} >
                <TestContext.Consumer>
                    {(val) => <Empty id={val} />}
                </TestContext.Consumer>
            </TestContext.Provider>;

        const { contents: dom } = buildOnce(orig, null);
        if (dom == null) {
            should(dom).not.Null();
            return;
        }
        const expected = deepFilterElemsToPublic(<Empty key="Provider-Consumer-Empty" id={201} />);
        should(deepFilterElemsToPublic(dom)).eql(expected);
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
                                {(val) => <Empty id={val} />}
                            </TestContext.Consumer>
                        </TestContext.Provider>
                        <TestContext.Consumer>
                            {(val) => <Empty id={val} />}
                        </TestContext.Consumer>
                    </Group>
                </TestContext.Provider>
                <TestContext.Consumer>
                    {(val) => <Empty id={val} />}
                </TestContext.Consumer>
            </Group>;

        const { contents: dom } = buildOnce(orig, null);
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

    it("Should error if Provider has more than one child", () => {
        // tslint:disable-next-line:variable-name
        const TestContext = createContext(1);
        const orig =
            // @ts-ignore
            <TestContext.Provider value={2}>
                <Empty id={1} />
                <Empty id={2} />
            </TestContext.Provider>;
        const { contents: dom } = buildOnce(orig, null);
        if (dom == null) {
            should(dom).not.Null();
            return;
        }
        const expected = deepFilterElemsToPublic(
            // @ts-ignore
            <TestContext.Provider key="Provider" value={2}>
                <DomError>Component Provider cannot be built with current
                    props: A context Provider may only have a single child</DomError>
                <Empty id={1} />
                <Empty id={2} />
            </TestContext.Provider>);
        should(deepFilterElemsToPublic(dom)).eql(expected);
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
        const { contents: dom } = buildOnce(orig, null);
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

    xit("Should build SFC with Consumer", () => {
        // tslint:disable-next-line:variable-name
        const TestContext = createContext(11);

        // tslint:disable-next-line:variable-name
        function withId(El: any) {
            return (props: any) => {
                const { children, ...rest } = props;
                return (
                    <TestContext.Consumer>
                        { (id) => (
                            <El id={id} {...rest} >
                                {children}
                            </El>
                        )}
                    </TestContext.Consumer>
                );
            };
        }

        // tslint:disable-next-line:variable-name
        const EmptyEleven = withId(Empty);

        const orig = <EmptyEleven />;
        const res = Adapt.build(orig, null);
        should(res.messages).have.length(0);
        const domXml = Adapt.serializeDom(res.contents);
        const expected =
`<Adapt>
  <Empty id="11" key="EmptyEleven-Empty"/>
</Adapt>
`;
        should(domXml).eql(expected);
    });

});
