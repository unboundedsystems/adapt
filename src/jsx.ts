import * as ld from "lodash";

import { StyleRule } from "./css";
import { BuildNotImplemented } from "./error";
import { KeyTracker, UpdateStateInfo } from "./keys";
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
    updateState(state: any, keys: KeyTracker, info: UpdateStateInfo): void;
}

export type UnbsElementOrNull = UnbsElement<AnyProps> | null;

export function isElement(val: any): val is UnbsElement<AnyProps> {
    return val instanceof UnbsElementImpl;
}

export abstract class Component<Props> {
    // cleanup gets called after build of this component's
    // subtree has completed.
    cleanup?: (this: this) => void;

    constructor(readonly props: Props) { }

    build(): UnbsElementOrNull {
        throw new BuildNotImplemented();
    }
}

export type PropsType<Comp extends tySup.Constructor<Component<any>>> =
    Comp extends tySup.Constructor<Component<infer CProps>> ? CProps :
    never;

export abstract class PrimitiveComponent<Props> extends Component<Props> {

    updateState(_state: any, _info: UpdateStateInfo) { return; }
}

export function isPrimitive(component: Component<any>):
    component is PrimitiveComponent<any> {
    return component instanceof PrimitiveComponent;
}

export type SFC = (props: AnyProps) => UnbsElementOrNull;

export function isComponent(func: SFC | Component<any>):
    func is Component<any> {
    return func instanceof Component;
}

export function isPrimitiveElement(elem: UnbsElement): elem is UnbsPrimitiveElement<any> {
    return isPrimitive(elem.componentType.prototype);
}

export interface ComponentStatic<P> {
    defaultProps?: Partial<P>;
}
export interface FunctionComponentTyp<P> extends ComponentStatic<P> {
    (props: P): UnbsElementOrNull;
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
    children?: UnbsElementOrNull | UnbsElementOrNull[];
}
// Used internally for fully validated children array
export interface WithChildrenArray {
    children: UnbsElement[];
}

export type GenericComponent = Component<AnyProps>;

/**
 * Keep track of which rules have matched for a set of props so that in the
 * typical case, the same rule won't match the same component instance more
 * than once.
 *
 * @interface MatchProps
 */
export interface MatchProps {
    matched?: Set<StyleRule>;
    stop?: boolean;
}
export const $cssMatch = Symbol.for("$cssMatch");
export interface WithMatchProps {
    [$cssMatch]?: MatchProps;
}

export class UnbsElementImpl<Props> implements UnbsElement<Props> {
    readonly props: Props & WithChildrenArray & Required<WithMatchProps>;

    constructor(
        readonly componentType: ComponentType<Props>,
        props: Props,
        children: any[]) {
        this.props = {
            [$cssMatch]: {},
            ...props as any
        };
        // Children passed as explicit parameter replace any on props
        if (children.length > 0) this.props.children = children;

        // Validate and flatten children. Ensure that children is always
        // an array of non-null elements
        this.props.children = ld.flatten(childrenToArray(this.props.children));

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

    updateState(state: any, keys: KeyTracker, info: UpdateStateInfo) {
        if (this.componentInstance == null) {
            this.componentInstance = new this.componentType(this.props);
        }

        keys.addKey(this.componentInstance);
        this.componentInstance.updateState(state, info);
        if (this.props.children == null ||
            !Array.isArray(this.props.children)) {
            return;
        }

        keys.pathPush();
        try {
            for (const child of this.props.children) {
                if (child == null) continue;
                if (isPrimitiveElement(child)) {
                    child.updateState(state, keys, info);
                }
            }
        } finally {
            keys.pathPop();
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
    let fixedProps = ((props === null) ? {} : props) as PropsNoChildren;
    if (ctor.defaultProps) {
        // The 'as any' below is due to open TS bugs/PR:
        // https://github.com/Microsoft/TypeScript/pull/13288
        fixedProps = {
            ...ctor.defaultProps as any,
            ...props as any
        };
    }
    if (isPrimitive(ctor.prototype)) {
        return new UnbsPrimitiveElementImpl(
            ctor as PrimitiveClassComponentTyp<Props>,
            fixedProps,
            children);
    } else {
        return new UnbsElementImpl(ctor, fixedProps, children);
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

export function childrenToArray(
    propsChildren: UnbsElementOrNull | UnbsElementOrNull[] | undefined): UnbsElement[] {
    if (propsChildren == null) return [];
    if (!Array.isArray(propsChildren)) return [propsChildren];

    return propsChildren.filter((c) => c != null) as UnbsElement[];
}
