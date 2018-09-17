import * as util from "util";

import * as ld from "lodash";

import { Constructor, ExcludeInterface, Message, MessageType } from "@usys/utils";
import { StyleRule } from "./css";
import { BuildNotImplemented } from "./error";
import { registerConstructor } from "./reanimate";
import { applyStateUpdates, StateNamespace, StateStore, StateUpdater } from "./state";
import * as tySup from "./type_support";

//This is broken, why does JSX.ElementClass correspond to both the type
//a Component construtor has to return and what createElement has to return?
//I don't think React actually adheres to this constraint.
export interface AdaptElement<P extends object = AnyProps> {
    readonly props: P & BuiltinProps;
    readonly componentType: ComponentType<P>;
}
export function isElement<P extends object = AnyProps>(val: any): val is AdaptElement<P> {
    return val instanceof AdaptElementImpl;
}
export function isElementImpl<P extends object = AnyProps>(val: any): val is AdaptElementImpl<P> {
    return isElement(val);
}
export type AdaptElementOrNull = AdaptElement<AnyProps> | null;

export interface AdaptMountedElement<P extends object = AnyProps> extends AdaptElement<P> {
    readonly id: string;
    readonly path: string;
}
export function isMountedElement<P extends object = AnyProps>(val: any): val is AdaptMountedElement<P> {
    return isElementImpl(val) && val.mounted;
}

export interface AdaptDeferredElement<P extends object = AnyProps> extends AdaptElement<P> {
    readonly componentType: PrimitiveClassComponentTyp<P>;
}

export function isDeferredElement<P extends object = AnyProps>(val: AdaptElement<P>): val is AdaptDeferredElement<P> {
    return isDeferred(val.componentType.prototype);
}

export function isDeferredElementImpl<P extends object = AnyProps>(val: AdaptElement<P>):
    val is AdaptDeferredElementImpl<P> {
    return val instanceof AdaptDeferredElementImpl;
}

export interface AdaptPrimitiveElement<P extends object = AnyProps> extends AdaptDeferredElement<P> {
}
export function isPrimitiveElement<P extends object>(elem: AdaptElement<P>): elem is AdaptPrimitiveElement<P> {
    return isPrimitive(elem.componentType.prototype);
}

export interface AdaptMountedPrimitiveElement<P extends object = AnyProps>
    extends AdaptPrimitiveElement<P> {
    readonly id: string;
    readonly path: string;
    validate(): Message[];
}
export function isMountedPrimitiveElement<P extends object>(elem: AdaptElement<P>):
    elem is AdaptMountedPrimitiveElement<P> {
    return isPrimitiveElement(elem) && isMountedElement(elem);
}

export interface AdaptComponentElement<P extends object = AnyProps> extends AdaptElement<P> {
    readonly componentType: ClassComponentTyp<P, AnyState>;
}
export function isComponentElement<P extends object = AnyProps>(val: any): val is AdaptComponentElement<P> {
    return isElement(val) && isComponent(val.componentType.prototype);
}

export abstract class Component<Props extends object = {}, State extends object = {}> {

    // cleanup gets called after build of this component's
    // subtree has completed.
    cleanup?: (this: this) => void;

    private stateUpdates: StateUpdater<Props, State>[] = [];
    private getState?: () => any;

    get state(): Readonly<State> {
        if (this.getState == null) {
            throw new Error(`this.state cannot be accessed before calling super()`);
        }
        if (this.initialState == null) {
            throw new Error(`cannot access this.state in a Component that ` +
                            `lacks an initialState method`);
        }
        return this.getState();
    }
    set state(_: Readonly<State>) {
        throw new Error(`State for a component can only be changed by calling this.setState`);
    }

    constructor(readonly props: Props & BuiltinProps) {
        registerConstructor(this.constructor);

        const cData = getComponentConstructorData();
        const curState = cData.getState();
        if (curState === undefined && this.initialState != null) {
            const init = this.initialState();
            if (init == null || !ld.isObject(init)) {
                throw new Error(`initialState function returned invalid value ` +
                                `'${init}'. initialState must return an object.`);
            }
            cData.setInitialState(init);
        }

        // Prevent subclass constructors from accessing this.state too early
        // by waiting to init getState.
        this.getState = cData.getState;
    }

    setState(stateUpdate: Partial<State> | StateUpdater<Props, State>): void {
        if (this.initialState == null) {
            throw new Error(`Component ${this.constructor.name}: cannot access ` +
                            `this.setState in a Component that lacks an ` +
                            `initialState method`);
        }
        this.stateUpdates.push(ld.isFunction(stateUpdate) ?
                               stateUpdate : () => stateUpdate);
    }

    // If a component uses state, it MUST define initialState
    initialState?(): State;

    abstract build(): AdaptElementOrNull | Promise<AdaptElementOrNull>;
}

export type PropsType<Comp extends Constructor<Component<any, any>>> =
    Comp extends Constructor<Component<infer CProps, any>> ? CProps :
    never;

export abstract class DeferredComponent<Props extends object = {}, State extends object = {}>
    extends Component<Props, State> { }

export function isDeferred<P extends object, S extends object>(component: Component<P, S>):
    component is DeferredComponent<P, S> {
    return component instanceof DeferredComponent;
}

export abstract class PrimitiveComponent<Props extends object = {}, State extends object = {}>
    extends DeferredComponent<Props, State> {

    build(): AdaptElementOrNull { throw new BuildNotImplemented(); }
    validate(): string | string[] | undefined { return; }
}

export function isPrimitive<P extends object>(component: Component<P>):
    component is PrimitiveComponent<P> {
    return component instanceof PrimitiveComponent;
}

export type SFC = (props: AnyProps) => AdaptElementOrNull;

export function isComponent<P extends object, S extends object>(func: SFC | Component<P, S>):
    func is Component<P, S> {
    return func instanceof Component;
}

export interface ComponentStatic<P> {
    defaultProps?: Partial<P>;
}
export interface FunctionComponentTyp<P> extends ComponentStatic<P> {
    (props: P & BuiltinProps): AdaptElementOrNull;
}
export interface ClassComponentTyp<P extends object, S extends object> extends ComponentStatic<P> {
    new(props: P & BuiltinProps): Component<P, S>;
}
export interface DeferredClassComponentTyp<P extends object, S extends object> extends ComponentStatic<P> {
    new(props: P & BuiltinProps): DeferredComponent<P, S>;
}
export interface PrimitiveClassComponentTyp<P extends object> extends ComponentStatic<P> {
    new(props: P & BuiltinProps): PrimitiveComponent<P>;
}

export type ComponentType<P extends object> =
    FunctionComponentTyp<P> |
    ClassComponentTyp<P, AnyState> |
    DeferredClassComponentTyp<P, AnyState> |
    PrimitiveClassComponentTyp<P>;

export interface AnyProps {
    [key: string]: any;
}

export interface BuiltinProps {
    key?: string;
}

export interface AnyState {
    [key: string]: any;
}

export interface WithChildren {
    children?: any | any[];
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

export class AdaptElementImpl<Props extends object> implements AdaptElement<Props> {
    readonly props: Props & BuiltinProps & WithChildren & Required<WithMatchProps>;

    stateNamespace: StateNamespace = [];
    mounted = false;
    component: GenericComponent | null;
    path?: string;

    constructor(
        readonly componentType: ComponentType<Props>,
        props: Props & BuiltinProps,
        children: any[]) {

        this.props = {
            [$cssMatch]: {},
            // https://github.com/Microsoft/TypeScript/pull/13288
            ...props as any
        };
        // Children passed as explicit parameter replace any on props
        if (children.length > 0) this.props.children = children;

        // Validate and flatten children.
        this.props.children = simplifyChildren(this.props.children);
        if (this.props.children === undefined) {
            delete this.props.children;
        }

        Object.freeze(this.props);
    }

    mount(parentNamespace: StateNamespace, path: string) {
        if (this.mounted) {
            throw new Error("Cannot remount elements!");
        }
        if ("key" in this.props) {
            const propsWithKey = this.props as Props & { key: string };
            this.stateNamespace = [...parentNamespace, propsWithKey.key];
        } else {
            throw new Error(`Internal Error: props has no key at mount: ${util.inspect(this)}`);
        }
        this.path = path;
        this.mounted = true;
    }

    postBuild(stateStore: StateStore): { stateChanged: boolean } {
        if (this.component == null) return { stateChanged: false };
        const updates: StateUpdater[] = (this.component as any).stateUpdates;
        return {
            stateChanged: applyStateUpdates(this.stateNamespace, stateStore,
                                            this.props, updates)
        };
    }

    get id() { return JSON.stringify(this.stateNamespace); }
}

enum DeferredState {
    initial = "initial",
    deferred = "deferred",
    built = "built"
}

export class AdaptDeferredElementImpl<Props extends object> extends AdaptElementImpl<Props> {
    state = DeferredState.initial;

    deferred() {
        this.state = DeferredState.deferred;
    }

    built() {
        this.state = DeferredState.built;
    }

    shouldBuild() {
        return this.state === DeferredState.deferred; //Build if we've deferred once
    }
}

export class AdaptPrimitiveElementImpl<Props extends object> extends AdaptDeferredElementImpl<Props> {
    component: PrimitiveComponent<Props> | null;
    constructor(
        readonly componentType: PrimitiveClassComponentTyp<Props>,
        props: Props & BuiltinProps,
        children: any[]
    ) {
        super(componentType, props, children);
    }

    validate(): Message[] {
        if (!this.mounted) {
            throw new Error(
                `Internal error: validate called on unmounted component at ` +
                `${this.path}`
            );
        }
        if (this.component == null) {
            throw new Error(
                `Internal error: validate called but component instance not ` +
                `created at ${this.path}`
            );
        }

        let ret = this.component.validate();

        if (ret === undefined) ret = [];
        else if (typeof ret === "string") ret = [ret];
        else if (!Array.isArray(ret)) {
            throw new Error(`Incorrect type '${typeof ret}' returned from ` +
                `component validate at ${this.path}`);
        }

        return ret.map((m) => ({
            type: MessageType.warning,
            timestamp: Date.now(),
            from: "DOM validate",
            content:
                `Component validation error. [${this.path}] cannot be ` +
                `built with current props: ${m}`,
        }));
    }
}

export function createElement<Props extends object>(
    ctor: string |
        FunctionComponentTyp<Props> |
        ClassComponentTyp<Props, AnyState>,
    //props should never be null, but tsc will pass null when Props = {} in .js
    //See below for null workaround, exclude null here for explicit callers
    props: ExcludeInterface<Props, tySup.Children<any>> & BuiltinProps,
    ...children: tySup.ChildType<Props>[]): AdaptElement {

    if (typeof ctor === "string") {
        throw new Error("createElement cannot called with string element type");
    }

    type PropsNoChildren =
        ExcludeInterface<Props, tySup.Children<any>>;

    //props===null PropsNoChildren == {}
    let fixedProps = ((props === null) ? {} : props) as PropsNoChildren & BuiltinProps;
    if (ctor.defaultProps) {
        // The 'as any' below is due to open TS bugs/PR:
        // https://github.com/Microsoft/TypeScript/pull/13288
        fixedProps = {
            ...ctor.defaultProps as any,
            ...props as any
        };
    }
    if (isPrimitive(ctor.prototype)) {
        return new AdaptPrimitiveElementImpl(
            ctor as PrimitiveClassComponentTyp<Props>,
            fixedProps,
            children);
    } else if (isDeferred(ctor.prototype)) {
        return new AdaptDeferredElementImpl(
            ctor as DeferredClassComponentTyp<Props, AnyState>,
            fixedProps,
            children
        );
    } else {
        return new AdaptElementImpl(ctor, fixedProps, children);
    }
}

export function cloneElement(
    element: AdaptElement,
    props: AnyProps,
    ...children: any[]): AdaptElement {

    const newProps = {
        ...element.props,
        ...props
    };

    if (isPrimitiveElement(element)) {
        return new AdaptPrimitiveElementImpl(element.componentType, newProps, children);
    } else if (isDeferredElement(element)) {
        return new AdaptDeferredElementImpl(element.componentType, newProps, children);
    } else {
        return new AdaptElementImpl(element.componentType, newProps, children);
    }
}

export function childrenToArray(propsChildren: any | any[] | undefined): any[] {
    const ret = simplifyChildren(propsChildren);
    if (ret == null) return [];
    if (!Array.isArray(ret)) return [ret];
    return ret;
}

export function simplifyChildren(children: any | any[] | undefined): any | any[] | undefined {
    if (ld.isArray(children)) {
        const flatChildren = ld.flatten(children);
        children = flatChildren.filter((e) => e != null);

        if (children.length === 0) {
            return undefined;
        } else if (children.length === 1) {
            return children[0];
        }
    }

    return children;
}

export interface ComponentConstructorData {
    getState: () => any;
    setInitialState: <T extends object>(init: T) => void;
}

let componentConstructorStack: ComponentConstructorData[] = [];

// exported as support utility for testing only
export function setComponentConstructorStack_(stack: ComponentConstructorData[]): ComponentConstructorData[] {
    const old = componentConstructorStack;
    componentConstructorStack = stack;
    return old;
}

export function pushComponentConstructorData(d: ComponentConstructorData) {
    componentConstructorStack.push(d);
}

export function popComponentConstructorData() {
    componentConstructorStack.pop();
}

function getComponentConstructorData(): ComponentConstructorData {
    const data = ld.last(componentConstructorStack);
    if (data == null) {
        throw new Error(`Internal error: componentConstructorStack is empty`);
    }
    return data;
}
