import * as unbs from "../src";

import should = require("should");

import { checkChildComponents } from "./testlib";

class Dummy extends unbs.Component<unbs.AnyProps> {
    constructor(props: unbs.AnyProps) {
        super(props);
    }

    build(): never {
        throw new Error("Cannot build Dummy component");
    }
}

describe("JSX SFC createElement Tests", () => {
    function Component(_props: any): unbs.UnbsElement {
        throw new Error("Test is not supposed to render");
    }

    it("Element should construct", () => {
        <Component />;
    });

    it("Should have the correct type", () => {
        const element = <Component />;
        should(unbs.isElement(element)).True();
    });

    it("Should have the correct componentType", () => {
        const element = <Component />;
        should(element.componentType).equal(Component);
    });

    it("Should have the right props", () => {
        const element = <Component x={1} y="bar" />;
        should(element.props).eql({ x: 1, y: "bar", children: [] });
    });

    it("Should have the right children", () => {
        const element =
            <Component>
                <Dummy />
                <unbs.Group />
            </Component>;

        checkChildComponents(element, Dummy, unbs.Group);
    });

    it("Should allow children as a prop", () => {
        // One child
        let element = <Component children={<Dummy />} />;
        checkChildComponents(element, Dummy);

        // Now two
        const kids = [<unbs.Group />, <Dummy />];
        element = <Component children={kids} />;
        checkChildComponents(element, unbs.Group, Dummy);
    });

    it("Tag-wrapped children should override children as a prop", () => {
        const element =
            // @ts-ignore
            <Component children={<Dummy />}>
                <unbs.Group />
            </Component>;
        checkChildComponents(element, unbs.Group);
    });
});

describe("JSX Class createElement Tests", () => {
    it("Element should construct", async () => {
        <unbs.Group />;
    });

    it("Element should have the correct type", () => {
        const element = <unbs.Group />;
        should(unbs.isElement(element)).be.True();
    });

    it("Element should have the correct componentType", () => {
        const element = <unbs.Group />;
        should(element.componentType).equal(unbs.Group);
    });

    it("Should have the right props", () => {
        const element = <Dummy x={1} y="foo" />;
        should(element.props).eql({ x: 1, y: "foo", children: [] });
    });

    it("Should have the right children", () => {
        const element =
            <unbs.Group>
                <Dummy />
                <unbs.Group />
            </unbs.Group>;

        checkChildComponents(element, Dummy, unbs.Group);
    });

    it("Should allow children as a prop", () => {
        // One child
        let element = <unbs.Group children={<Dummy />} />;
        checkChildComponents(element, Dummy);

        // Now two
        const kids = [<unbs.Group />, <Dummy />];
        element = <unbs.Group children={kids} />;
        checkChildComponents(element, unbs.Group, Dummy);
    });

    it("Tag-wrapped children should override children as a prop", () => {
        const element =
            // @ts-ignore
            <unbs.Group children={<Dummy />}>
                <unbs.Group />
            </unbs.Group>;
        checkChildComponents(element, unbs.Group);
    });
});

describe("JSX cloneElement Tests", () => {
    it("Should clone singleton elements", () => {
        const element = unbs.cloneElement(<unbs.Group />, {});
        should(element).not.Null();
        should(unbs.isElement(element)).be.True();
        should(element.componentType).equal(unbs.Group);
    });

    it("Should clone with new props", () => {
        const element = unbs.cloneElement(<Dummy a={1} b={2} />,
            { b: 4 });
        should(element).not.Null();
        should(element.props.a).equal(1);
        should(element.props.b).equal(4);
    });

    it("Should clone with children", () => {
        const element = unbs.cloneElement(<unbs.Group />, {},
            <Dummy />, <unbs.Group />);

        checkChildComponents(element, Dummy, unbs.Group);
    });

    it("Should clone children on original element", () => {
        const element = unbs.cloneElement(<unbs.Group><Dummy /></unbs.Group>,
                                          {});
        checkChildComponents(element, Dummy);
    });

    it("Children on props should override children on original element", () => {
        const element = unbs.cloneElement(<unbs.Group><Dummy /></unbs.Group>,
                                          {children: [<unbs.Group />]});
        checkChildComponents(element, unbs.Group);
    });

    it("Children as params should override orig and props", () => {
        function Dummy2(_props: any): unbs.UnbsElement {
            throw new Error("Test is not supposed to render");
        }

        const element = unbs.cloneElement(<unbs.Group><Dummy /></unbs.Group>,
                                          {children: [<unbs.Group />]},
                                          <Dummy2 />, <Dummy2 />);
        checkChildComponents(element, Dummy2, Dummy2);
    });

});
