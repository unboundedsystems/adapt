import Adapt, { Children } from "../src";

import should = require("should");

import { checkChildComponents } from "./testlib";

class Dummy extends Adapt.Component<Adapt.AnyProps> {
    constructor(props: Adapt.AnyProps) {
        super(props);
    }

    build(): never {
        throw new Error("Cannot build Dummy component");
    }
}

describe("JSX SFC createElement Tests", () => {
    function Component(_props: any): Adapt.AdaptElement {
        throw new Error("Test is not supposed to render");
    }

    it("Element should construct", () => {
        <Component />;
    });

    it("Should have the correct type", () => {
        const element = <Component />;
        should(Adapt.isElement(element)).True();
    });

    it("Should have the correct componentType", () => {
        const element = <Component />;
        should(element.componentType).equal(Component);
    });

    it("Should have the right props", () => {
        const element = <Component x={1} y="bar" />;
        const { handle, ...elProps } = element.props; // Don't compare handle
        should(elProps).eql({ x: 1, y: "bar" });
    });

    it("Should have the right children", () => {
        const element =
            <Component>
                <Dummy />
                <Adapt.Group />
            </Component>;

        checkChildComponents(element, Dummy, Adapt.Group);
    });

    it("Should allow children as a prop", () => {
        // One child
        let element = <Component children={<Dummy />} />;
        checkChildComponents(element, Dummy);

        // Now two
        const kids = [<Adapt.Group />, <Dummy />];
        element = <Component children={kids} />;
        checkChildComponents(element, Adapt.Group, Dummy);
    });

    it("Tag-wrapped children should override children as a prop", () => {
        const element =
            // @ts-ignore
            <Component children={<Dummy />}>
                <Adapt.Group />
            </Component>;
        checkChildComponents(element, Adapt.Group);
    });
});

describe("JSX Class createElement Tests", () => {
    it("Element should construct", async () => {
        <Adapt.Group />;
    });

    it("Element should have the correct type", () => {
        const element = <Adapt.Group />;
        should(Adapt.isElement(element)).be.True();
    });

    it("Element should have the correct componentType", () => {
        const element = <Adapt.Group />;
        should(element.componentType).equal(Adapt.Group);
    });

    it("Should have the right props", () => {
        const element = <Dummy x={1} y="foo" />;
        const { handle, ...elProps } = element.props; // Don't compare handle
        should(elProps).eql({ x: 1, y: "foo" });
    });

    it("Should have the right children", () => {
        const element =
            <Adapt.Group>
                <Dummy />
                <Adapt.Group />
            </Adapt.Group>;

        checkChildComponents(element, Dummy, Adapt.Group);
    });

    it("Should allow children as a prop", () => {
        // One child
        let element = <Adapt.Group children={<Dummy />} />;
        checkChildComponents(element, Dummy);

        // Now two
        const kids = [<Adapt.Group />, <Dummy />];
        element = <Adapt.Group children={kids} />;
        checkChildComponents(element, Adapt.Group, Dummy);
    });

    it("Tag-wrapped children should override children as a prop", () => {
        const element =
            // @ts-ignore
            <Adapt.Group children={<Dummy />}>
                <Adapt.Group />
            </Adapt.Group>;
        checkChildComponents(element, Adapt.Group);
    });
});

describe("JSX cloneElement Tests", () => {
    it("Should clone singleton elements", () => {
        const element = Adapt.cloneElement(<Adapt.Group />, {});
        should(element).not.Null();
        should(Adapt.isElement(element)).be.True();
        should(element.componentType).equal(Adapt.Group);
    });

    it("Should clone with new props", () => {
        const element = Adapt.cloneElement(<Dummy a={1} b={2} />,
            { b: 4 });
        should(element).not.Null();
        should(element.props.a).equal(1);
        should(element.props.b).equal(4);
    });

    it("Should clone with children", () => {
        const element = Adapt.cloneElement(<Adapt.Group />, {},
            <Dummy />, <Adapt.Group />);

        checkChildComponents(element, Dummy, Adapt.Group);
    });

    it("Should clone children on original element", () => {
        const element = Adapt.cloneElement(<Adapt.Group><Dummy /></Adapt.Group>,
                                          {});
        checkChildComponents(element, Dummy);
    });

    it("Children on props should override children on original element", () => {
        const element = Adapt.cloneElement(<Adapt.Group><Dummy /></Adapt.Group>,
                                          {children: [<Adapt.Group />]});
        checkChildComponents(element, Adapt.Group);
    });

    it("Children as params should override orig and props", () => {
        function Dummy2(_props: any): Adapt.AdaptElement {
            throw new Error("Test is not supposed to render");
        }

        const element = Adapt.cloneElement(<Adapt.Group><Dummy /></Adapt.Group>,
                                          {children: [<Adapt.Group />]},
                                          <Dummy2 />, <Dummy2 />);
        checkChildComponents(element, Dummy2, Dummy2);
    });

});

describe("JSX Child Handling Tests", () => {
    function Test(_props: {} & Children<string | number>) {
        return null;
    }

    it("Singleton Child should be accepted", () => {
        const elem = <Test>
            {"foo"}
        </Test>;

        should(elem.props.children).eql("foo");
    });

    it("Multiple Children should be accepted", () => {
        const elem = <Test>
            {"foo"}
            {"bar"}
        </Test>;

        should(elem.props.children).eql(["foo", "bar"]);
    });

    it("Array Children should be accepted and flattened", () => {
        const elem = <Test>
            {["foo", 3]}
            {"bar"}
            {[4, 5]}
        </Test>;

        should(elem.props.children).eql(["foo", 3, "bar", 4, 5]);
    });

});
