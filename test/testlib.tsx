import * as should from "should";
import * as unbs from "../src";

export function checkChildComponents(element: unbs.UnbsElement, ...children: any[]) {
    should(element.props.children).not.Null();
    should(element.props.children).be.Array();

    const childComponents = element.props.children.map(
        (child: any) => {
            if (unbs.isElement(child)) {
                return child.componentType;
            } else {
                return undefined;
            }
        }
    );

    should(childComponents).eql(children);
}

export class Empty extends unbs.PrimitiveComponent<{ id: number }> { }

export function MakeMakeEmpty(props: { id: number }) {
    return <MakeEmpty id={props.id} />;
}

export function MakeEmpty(props: { id: number }) {
    return <Empty id={props.id} />;
}

export function MakeGroup(props: { children?: unbs.UnbsElement[] | unbs.UnbsElement }) {
    return <unbs.Group>{props.children}</unbs.Group>;
}

export interface WithDefaultsProps {
    prop1?: number;
    prop2?: number;
}
export class WithDefaults extends unbs.Component<WithDefaultsProps> {
    static defaultProps = {
        prop1: 100,
        prop2: 200,
    };

    build() {
        return (
            <unbs.Group>
                <Empty id={this.props.prop1!} />
                <Empty id={this.props.prop2!} />
            </unbs.Group>
        );
    }
}
