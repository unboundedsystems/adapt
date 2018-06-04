import * as util from "util";

import * as ld from "lodash";

import * as tySup from "./type_support";

//This is broken, why does JSX.ElementClass correspond to both the type
//a Component construtor has to return and what createElement has to return?
//I don't think React actually adheres to this constraint.
export interface UnbsElement<P = AnyProps> {
    readonly props: P;
    readonly componentType: ComponentType<P>;
}

export interface UnbsPrimitiveElement<P> extends UnbsElement<P> {
    readonly componentType: PrimitiveClassComponentTyp<P>;
    updateState(state: any): void;
}

export type UnbsNode = UnbsElement<AnyProps> | null;

export function isElement(val: any): val is UnbsElement<AnyProps> {
    return val instanceof UnbsElementImpl;
}

export abstract class Component<Props> {
    constructor(readonly props: Props) { }

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

export type SFC = (props: AnyProps) => UnbsNode;

export function isComponent(func: SFC | Component<any>):
    func is Component<any> {
    return func instanceof Component;
}

export function isAbstract(component: Component<any>) {
    return isComponent(component) && !component.build;
}

export function isPrimitiveElement(elem: UnbsElement): elem is UnbsPrimitiveElement<any> {
    return isPrimitive(elem.componentType.prototype);
}

export interface ComponentStatic<P> {
    defaultProps?: Partial<P>;
}
export interface FunctionComponentTyp<P> extends ComponentStatic<P> {
    (props: P): UnbsNode;
}
export interface ClassComponentTyp<P>  extends ComponentStatic<P> {
    new (props: P): Component<P>;
}
export interface PrimitiveClassComponentTyp<P> extends ComponentStatic<P> {
    new (props: P): PrimitiveComponent<P>;
}

export type ComponentType<P> =
    FunctionComponentTyp<P> |
    ClassComponentTyp<P> |
    PrimitiveClassComponentTyp<P>;

export interface AnyProps {
    [key: string]: any;
}

export interface WithChildren {
    children?: any[];
}

export type GenericComponent = Component<AnyProps>;

export class UnbsElementImpl<Props> implements UnbsElement {
    readonly props: Props & WithChildren;

    constructor(
        readonly componentType: ComponentType<Props>,
        props: Props,
        children: any[]) {
        this.props = props;

        if (children.length > 0) {
            this.props.children = children;
        }
        Object.freeze(this.props);
    }
}

export class UnbsPrimitiveElementImpl<Props> extends UnbsElementImpl<Props> {
    componentInstance?: PrimitiveComponent<AnyProps>;

    constructor(
        readonly componentType: PrimitiveClassComponentTyp<Props>,
        props: Props,
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

export function createElement<Props>(
    ctor: string |
        FunctionComponentTyp<Props> |
        ClassComponentTyp<Props>,
    //props should never be null, but tsc will pass null when Props = {} in .js
    //See below for null workaround, exclude null here for explicit callers
    props: tySup.ExcludeInterface<Props, tySup.Children<any>>,
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
