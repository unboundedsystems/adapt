
import * as tySup from './type_support';

export namespace JSX {
    export interface IntrinsicElements {}

    export interface ElementAttributesProperty {
        props: never;
    }
    export interface ElementChildrenAttribute {
        children: never;
    }
    export type ElementClass = UNode;
    export type Element = UNode;
}

export abstract class Component<Props> {
    constructor(readonly props: Props) { }

    abstract build(): UNode;
}

export type UNode = Component<any> | string | null;

export interface GroupProps {
    children?: UNode[] | UNode;
}

export class Group extends Component<GroupProps> {
    constructor(props: GroupProps) {
        super(props);
    }

    build(): UNode {
        return null; //FIXME(manishv) call build on children here;
    }
}

export interface Children<C> {
    children: C[];
}

function childrenAreUNodes(ctor: string, children: any[]): children is UNode[] {
    if (ctor == "group") {
        return true;
    }
    return false;
}

export type FunctionComponentTyp<T> = (props: T) => Component<T>
export type ClassComponentTyp<T> = new (props: T) => Component<T>;
export type ChildType<T> =
    T extends Children<any> ? tySup.ExtractType<T, keyof Children<any>> : null;

export function createElement<Props>(
    ctor: string |
        FunctionComponentTyp<Props> |
        ClassComponentTyp<Props>,
    //props should never be null, but tsc will pass null when Props = {} in .js
    //See below for null workaround, exclude null here for explicit callers
    props: tySup.ExcludeInterface<Props, Children<any>>,
    ...children: ChildType<Props>[]): UNode {

    if (typeof ctor === "string") {
        switch (ctor) {
            case "group":
                if (childrenAreUNodes(ctor, children)) {
                    return new Group({ children: children });
                } else {
                    throw new TypeError("children of group must be UNodes")
                }
            default:
                throw new Error("Unknown primitive element " + ctor);
        }
    } else {
        //If props === null we got no props.  
        //createElement(ctor, null) will be generated in .js when Props is {}.
        //createElement(ctor, null) should never typecheck for 
        //explicit calls from .ts, use createElement(ctor, {}) instead.
        const coercedProps = (props === null ? {} : props) as Props;
        return tySup.asConsOrFunc(ctor)(coercedProps);
    }
}

