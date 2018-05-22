import * as util from 'util';

import * as ld from 'lodash';

import * as tySup from './type_support';

//This is broken, why does JSX.ElementClass correspond to both the type 
//a Component construtor has to return and what createElement has to return?
//I don't think React actually adheres to this constraint.
export interface UnbsElement {
    readonly props: AnyProps;
    readonly componentType: any;
}

export type UnbsNode = UnbsElement | null;

export function isElement(val: any): val is UnbsElement {
    return val instanceof UnbsElementImpl;
}

export abstract class Component<Props> {
    constructor(readonly props: Props) { }

    abstract build(): UnbsNode;
}

export abstract class PrimitiveComponent<Props>
    extends Component<Props> {

    //There will be other methods here, right now we just do instanceof

    build(): never {
        throw new Error("Attempt to call build for primitive component: " +
            util.inspect(this));
    }
}

export function isPrimitive(component: Component<any>):
    component is PrimitiveComponent<any> {
    return component instanceof PrimitiveComponent;
}

export type FunctionComponentTyp<T> = (props: T) => UnbsNode;
export type ClassComponentTyp<T> = new (props: T) => Component<T>;

export interface AnyProps {
    [key: string]: any
}

export type GenericComponent = Component<AnyProps>

export class UnbsElementImpl implements UnbsElement {
    readonly props: AnyProps;

    constructor(
        readonly componentType: any,
        readonly passedProps: AnyProps,
        children: any[]) {

        this.props = passedProps;
        if (children.length > 0) {
            this.props.children = children;
        }
    }
}

export function createElement<Props>(
    ctor: string |
        FunctionComponentTyp<Props> |
        ClassComponentTyp<Props>,
    //props should never be null, but tsc will pass null when Props = {} in .js
    //See below for null workaround, exclude null here for explicit callers
    props: tySup.ExcludeInterface<Props, tySup.Children<any>>,
    ...children: tySup.ChildType<Props>[]): UnbsElement {

    if (typeof ctor === "string") {
        throw new Error("createElement cannot called with string element type")
    }

    type PropsNoChildren =
        tySup.ExcludeInterface<Props, tySup.Children<any>>;

    //props===null PropsNoChildren == {}
    const fixedProps = ((props === null) ? {} : props) as PropsNoChildren;
    const flatChildren: any[] = ld.flatten(children);
    return new UnbsElementImpl(ctor, fixedProps, flatChildren);
}

export function cloneElement(
    element: UnbsElement,
    props: AnyProps,
    ...children: any[]): UnbsElement {

    const newProps = {
        ...element.props,
        ...props
    };
    return new UnbsElementImpl(element.componentType, newProps, children);
}