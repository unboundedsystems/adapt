import * as unbs from '../src';
import * as should from 'should';

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
    )

    should(childComponents).eql(children);
}