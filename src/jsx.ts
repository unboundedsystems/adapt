import * as ld from 'lodash';

import * as tySup from './type_support';
import { JSX } from './jsx_namespace';

//This is broken, why does JSX.ElementClass correspond to both the type 
//a Component construtor has to return and what createElement has to return?
//I don't think React actually adheres to this constraint.
export interface UnbsElement {
    readonly props: AnyProps;
    readonly componentType: any;
}

export type UnbsNode = UnbsElement | null;

export function isNode(val: any): val is UnbsElement {
    return val instanceof UnbsElementImpl;
}

export abstract class Component<Props> {
    constructor(readonly props: Props) { }

    abstract build(): UnbsNode;
}

export type FunctionComponentTyp<T> = (props: T) => UnbsNode;
export type ClassComponentTyp<T> = new (props: T) => Component<T>;

export function childrenAreNodes(ctor: string, children: any[]): children is JSX.Element[] {
    if (ctor == "group") {
        return true;
    }
    return false;
}

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
    let fixedProps = ((props === null) ? {} : props) as PropsNoChildren;
    return new UnbsElementImpl(ctor, fixedProps, children);
}