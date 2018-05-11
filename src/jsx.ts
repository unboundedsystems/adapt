import * as ld from 'lodash';

import * as tySup from './type_support';
import { JSX } from './jsx_namespace';

//This is broken, why does JSX.ElementClass correspond to both the type 
//a Component construtor has to return and what createElement has to return?
//I don't think React actually adheres to this constraint.
export interface UnbsNode extends JSX.ElementClass {
    readonly componentType: any;
}

export function isNode(val: any): val is UnbsNode {
    return val instanceof UnbsNodeImpl;
}

export abstract class Component<Props> {
    constructor(readonly props: Props) { }

    abstract build(): UnbsNode;
}

export interface GroupProps {
    children?: UnbsNode[] | UnbsNode;
}

export class Group extends Component<GroupProps> {
    constructor(props: GroupProps) {
        super(props);
    }

    build(): UnbsNode {
        let children: UnbsNode[] = [];
        if (this.props.children != null) {
            if (ld.isArray(this.props.children)) {
                children = this.props.children;
            } else {
                children = [this.props.children];
            }
        }
        let args: any[] = [Group, this.props];
        return createElement.apply(null, args.concat(children));
    }
}

export type FunctionComponentTyp<T> = (props: T) => Component<T>;
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

class UnbsNodeImpl implements UnbsNode {
    readonly props: AnyProps;

    constructor(
        readonly componentType: any,
        readonly ctor: (props: AnyProps) => GenericComponent,
        readonly passedProps: AnyProps,
        public children: any[]) {
        this.props = passedProps;
    }

    build(): never {
        throw new Error("Internal build method called.  Do not call build outside the library!");
    }
}

export function createElement<Props>(
    ctor: string |
        FunctionComponentTyp<Props> |
        ClassComponentTyp<Props>,
    //props should never be null, but tsc will pass null when Props = {} in .js
    //See below for null workaround, exclude null here for explicit callers
    props: tySup.ExcludeInterface<Props, tySup.Children<any>>,
    ...children: tySup.ChildType<Props>[]): UnbsNode {

    if (typeof ctor === "string") {
        throw new Error("createElement cannot called with string element type")
    }

    type PropsNoChildren =
        tySup.ExcludeInterface<Props, tySup.Children<any>>;
    const normalizedCtor =
        tySup.asConsOrFunc<PropsNoChildren, Component<PropsNoChildren>>(ctor);
    //props===null PropsNoChildren == {}
    let fixedProps = ((props === null) ? {} : props) as PropsNoChildren;
    return new UnbsNodeImpl(ctor, normalizedCtor, props, children);
}