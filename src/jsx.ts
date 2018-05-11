import * as tySup from './type_support';
import { JSX } from './jsx_namespace';

export interface UnbsNode {

}

export abstract class Component<Props> {
    constructor(readonly props: Props) { }

    abstract build(): UnbsNode;
}

export interface GroupProps {
    children?: JSX.Element[] | JSX.Element;
}

export class Group extends Component<GroupProps> {
    constructor(props: GroupProps) {
        super(props);
    }

    build(): UnbsNode {
        return {}; //FIXME(manishv) call build on children here;
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

export interface GenericProps {
    [key: string]: any
}

export type GenericComponent = Component<GenericProps>

class UnbsNodeImpl implements UnbsNode {
    constructor(
        readonly ctor: (props: GenericProps) => GenericComponent,
        readonly passedProps: GenericProps,
        public children: any[]) { }
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
    return new UnbsNodeImpl(normalizedCtor, props, children);
}