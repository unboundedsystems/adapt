import * as util from "util";

import * as ld from "lodash";

import { StyleRule } from "./css";
import { BuildNotImplemented } from "./error";
import { assignKeys, KeyTracker, UpdateStateInfo } from "./keys";
import { applyStateUpdate, computeStateUpdate, StateNamespace, StateStore, StateUpdater } from "./state";
import * as tySup from "./type_support";

//This is broken, why does JSX.ElementClass correspond to both the type
//a Component construtor has to return and what createElement has to return?
//I don't think React actually adheres to this constraint.
export interface UnbsElement<P extends object = AnyProps> {
    readonly props: P;
    readonly componentType: ComponentType<P>;
    readonly stateNamespace: StateNamespace;
    readonly mounted: boolean;
}

export interface UnbsPrimitiveElement<P extends object = AnyProps> extends UnbsElement<P> {
    readonly componentType: PrimitiveClassComponentTyp<P, AnyState>;
    updateState(state: any, keys: KeyTracker, info: UpdateStateInfo): void;
}

export type UnbsElementOrNull = UnbsElement<AnyProps> | null;

export function isElement(val: any): val is UnbsElement<AnyProps> {
    return val instanceof UnbsElementImpl;
}

export function isElementImpl(val: any): val is UnbsElementImpl<AnyProps> {
    return isElement(val);
}

export abstract class Component<Props extends object, State extends object> {

    readonly state: State;

    // cleanup gets called after build of this component's
    // subtree has completed.
    cleanup?: (this: this) => void;
    private stateUpdates: Partial<State>[] = [];

    constructor(readonly props: Props) { }

    setState(stateUpdate: Partial<State> | StateUpdater<Props, State>): void {
        const upd = computeStateUpdate(this.state, this.props, stateUpdate);
        this.stateUpdates.push(upd);
    }

    build(): UnbsElementOrNull {
        throw new BuildNotImplemented();
    }
}

export type PropsType<Comp extends tySup.Constructor<Component<any, any>>> =
    Comp extends tySup.Constructor<Component<infer CProps, any>> ? CProps :
    never;

export abstract class PrimitiveComponent<Props extends object, State extends object>
    extends Component<Props, State> {

    updateState(_state: any, _info: UpdateStateInfo) { return; }
}

export function isPrimitive<P extends object, S extends object>(component: Component<P, S>):
    component is PrimitiveComponent<P, S> {
    return component instanceof PrimitiveComponent;
}

export type SFC = (props: AnyProps) => UnbsElementOrNull;

export function isComponent<P extends object, S extends object>(func: SFC | Component<P, S>):
    func is Component<P, S> {
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
export interface ClassComponentTyp<P extends object, S extends object> extends ComponentStatic<P> {
    new(props: P): Component<P, S>;
}
export interface PrimitiveClassComponentTyp<P extends object, S extends object> extends ComponentStatic<P> {
    new(props: P): PrimitiveComponent<P, S>;
}

export type ComponentType<P extends object> =
    FunctionComponentTyp<P> |
    ClassComponentTyp<P, AnyState> |
    PrimitiveClassComponentTyp<P, AnyState>;

export interface AnyProps {
    [key: string]: any;
}

export interface AnyState {
    [key: string]: any;
}

export interface WithChildren {
    children?: UnbsElementOrNull | UnbsElementOrNull[];
}
// Used internally for fully validated children array
export interface WithChildrenArray {
    children: UnbsElement[];
}

export type GenericComponent = Component<AnyProps, AnyState>;

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

export class UnbsElementImpl<Props extends object> implements UnbsElement<Props> {
    readonly props: Props & WithChildrenArray & Required<WithMatchProps>;
    stateNamespace: StateNamespace = [];
    mounted = false;
    component: GenericComponent | null;

    constructor(
        readonly componentType: ComponentType<Props>,
        props: Props,
        children: any[]) {
        this.props = {
            [$cssMatch]: {},
            // https://github.com/Microsoft/TypeScript/pull/13288
            ...props as any
        };
        // Children passed as explicit parameter replace any on props
        if (children.length > 0) this.props.children = children;

        // Validate and flatten children. Ensure that children is always
        // an array of non-null elements
        this.props.children = ld.flatten(childrenToArray(this.props.children));
        assignKeys(this.props.children);
        Object.freeze(this.props);
    }

    mount(parentNamespace: StateNamespace) {
        if (this.mounted) {
            throw new Error("Cannot remount elements!");
        }
        if ("key" in this.props) {
            const propsWithKey = this.props as Props & { key: string };
            this.stateNamespace = [...parentNamespace, propsWithKey.key];
        } else {
            throw new Error(`Internal Error: props has no key at mount: ${util.inspect(this)}`);
        }
        this.mounted = true;
    }

    postBuild(stateStore: StateStore) {
        if (this.component != null) {
            const updates = ((this.component as any) as { stateUpdates: AnyState[] }).stateUpdates;
            applyStateUpdate(this.stateNamespace, this.component, stateStore, Object.assign.apply({}, updates));
        }
    }
}

export class UnbsPrimitiveElementImpl<Props extends object> extends UnbsElementImpl<Props> {
    componentInstance?: PrimitiveComponent<AnyProps, AnyState>;

    constructor(
        readonly componentType: PrimitiveClassComponentTyp<Props, AnyState>,
        props: Props,
        children: any[]
    ) {
        super(componentType, props, children);
    }

    updateState(state: AnyState, keys: KeyTracker, info: UpdateStateInfo) {
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

export function createElement<Props extends object>(
    ctor: string |
        FunctionComponentTyp<Props> |
        ClassComponentTyp<Props, AnyState>,
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
            ctor as PrimitiveClassComponentTyp<Props, AnyState>,
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
