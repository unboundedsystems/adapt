import * as util from "util";

import * as ld from "lodash";

import * as tySup from "./type_support";

//This is broken, why does JSX.ElementClass correspond to both the type
//a Component construtor has to return and what createElement has to return?
//I don't think React actually adheres to this constraint.
export interface UnbsElement {
    readonly props: AnyProps;
    readonly componentType: any;
}

export interface UnbsPrimitiveElement extends UnbsElement {
    updateState(state: any): void;
}

export type UnbsNode = UnbsElement | null;

export function isElement(val: any): val is UnbsElement {
    return val instanceof UnbsElementImpl;
}

export type Key = string | number;

export interface ClassAttributes<T> {
    key?: Key;
    ref?: RefObject<T>;
}

export abstract class Component<Props> {
    constructor(readonly props: Props & ClassAttributes<Component<Props>>) { }

    abstract build(): UnbsNode;
}

export abstract class PrimitiveComponent<Props>
    extends Component<Props> {

    updateState(_state: any) { return; }

    build(): never {
        throw new Error("Attempt to call build for primitive component: " +
            util.inspect(this));
    }
}

export function isPrimitive(component: Component<any>):
    component is PrimitiveComponent<any> {
    return component instanceof PrimitiveComponent;
}

export function isPrimitiveElement(elem: UnbsElement): elem is UnbsPrimitiveElement {
    return isPrimitive(elem.componentType.prototype);
}

export type FunctionComponentTyp<T> = (props: T) => UnbsNode;
export type ClassComponentTyp<T> = new (props: T) => Component<T>;
export type PrimitiveClassComponentTyp<T> = new (props: T) => PrimitiveComponent<T>;

export interface AnyProps {
    [key: string]: any;
}

export type GenericComponent = Component<AnyProps>;

export class UnbsElementImpl implements UnbsElement {
    constructor(
        readonly componentType: any,
        readonly props: AnyProps,
        children: any[]) {

        if (children.length > 0) {
            this.props.children = children;
        }
        Object.freeze(this.props);
    }
}

export class UnbsPrimitiveElementImpl extends UnbsElementImpl {
    componentInstance?: PrimitiveComponent<AnyProps>;

    constructor(
        readonly componentType: new (props: AnyProps) => PrimitiveComponent<AnyProps>,
        readonly props: AnyProps,
        children: any[]
    ) {
        super(componentType, props, children);
    }

    updateState(state: any) {
        if (this.componentInstance == null) {
            this.componentInstance = new this.componentType(this.props);
        }

        this.componentInstance.updateState(state);
        if (this.props.children == null) return;

        for (const child of this.props.children) {
            if (isPrimitiveElement(child)) {
                child.updateState(state);
            }
        }
    }
}

export interface RefObject<T> {
    readonly current: T | null;
}

export function createRef<T = any>(): RefObject<T> {
    return {
        current: null
    };
}

export function createElement<Props, T extends UnbsElement>(
    ctor: string |
        FunctionComponentTyp<Props> |
        ClassComponentTyp<Props>,
    //props should never be null, but tsc will pass null when Props = {} in .js
    //See below for null workaround, exclude null here for explicit callers
    props: tySup.ExcludeInterface<Props, tySup.Children<any>> & ClassAttributes<T>,
    ...children: tySup.ChildType<Props>[]): UnbsElement {

    if (typeof ctor === "string") {
        throw new Error("createElement cannot called with string element type");
    }

    type PropsNoChildren =
        tySup.ExcludeInterface<Props, tySup.Children<any>>;

    //props===null PropsNoChildren == {}
    const fixedProps = ((props === null) ? {} : props) as PropsNoChildren;
    const flatChildren: any[] = ld.flatten(children);
    if (isPrimitive(ctor.prototype)) {
        return new UnbsPrimitiveElementImpl(
            ctor as PrimitiveClassComponentTyp<Props>,
            fixedProps,
            flatChildren);
    } else {
        return new UnbsElementImpl(ctor, fixedProps, flatChildren);
    }
}

export function cloneElement(
    element: UnbsElement,
    props: AnyProps,
    ...children: any[]): UnbsElement {

    const newProps = {
        ...element.props,
        ...props
    };

    if (isPrimitiveElement(element)) {
        return new UnbsPrimitiveElementImpl(element.componentType, newProps, children);
    } else {
        return new UnbsElementImpl(element.componentType, newProps, children);
    }
}
