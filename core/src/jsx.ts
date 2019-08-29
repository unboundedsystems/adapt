/*
 * Copyright 2018-2019 Unbounded Systems, LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import * as util from "util";

import * as ld from "lodash";
import { OptionalPropertiesT, RequiredPropertiesT } from "type-ops";

import {
    Constructor,
    ExcludeInterface,
    isInstance,
    Message,
    MessageType,
    tagConstructor,
} from "@adpt/utils";
import { printError as gqlPrintError } from "graphql";
import {
    DependsOn,
    DependsOnMethod,
    DeployedWhenMethod,
    DeployHelpers,
    GoalStatus,
    WaitStatus,
} from "./deploy/deploy_types";
import { BuildData } from "./dom";
import { BuildNotImplemented, InternalError } from "./error";
import { BuildId, Handle, handle, isHandle, isHandleInternal } from "./handle";
import { Defaultize } from "./jsx_namespace";
import { ObserverNeedsData } from "./observers/errors";
import { ObserverManagerDeployment } from "./observers/obs_manager_deployment";
import { adaptGqlExecute } from "./observers/query_transforms";
import { findObserver } from "./observers/registry";
import { registerConstructor } from "./reanimate";
import { DeployOpID } from "./server/deployment_data";
import { applyStateUpdates, StateNamespace, StateStore, StateUpdater } from "./state";
import { defaultStatus, NoStatusAvailable, ObserveForStatus, Status } from "./status";
import { Children, ChildType } from "./type_support";

//dom.ts needs to set this since a direct import will cause a circular require
// tslint:disable-next-line:variable-name
export let ApplyStyle: ComponentType<any>;
export function isApplyStyle(el: AdaptElement) {
    return el.componentType === ApplyStyle;
}

/**
 * An Adapt Element is an instance of an Adapt component.
 *
 * @remarks
 * The Adapt DOM is composed of Elements.
 *
 * @public
 *
 * @privateRemarks
 * NOTE(manishv):
 * This is broken, why does JSX.ElementClass correspond to both the type
 * a Component construtor has to return and what createElement has to return?
 * I don't think React actually adheres to this constraint.
 */
export interface AdaptElement<P extends object = AnyProps> {
    /** A copy of the props that the element was instantiated with */
    readonly props: P & BuiltinProps;
    /**
     * The type of component that is associated with this element.
     * @remarks
     * For class components, this is the class (constructor) object.
     * For function components, this is the function object.
     */
    readonly componentType: ComponentType<P>;
    /**
     * The name of the class or function in {@link AdaptElement.componentType},
     * as returned by `componentType.name` or, the string `"anonymous"` if
     * no name is available.
     */
    readonly componentName: string;
    /**
     * The name that a component author (optionally) associated with the
     * component using the `displayName` static property. If not set on a
     * component, defaults to {@link AdaptElement.componentName}.
     */
    readonly displayName: string;
}
export function isElement<P extends object = AnyProps>(val: any): val is AdaptElement<P> {
    return isInstance(val, AdaptElementImpl, "adapt");
}
export function isElementImpl<P extends object = AnyProps>(val: any): val is AdaptElementImpl<P> {
    return isElement(val);
}
export type AdaptElementOrNull = AdaptElement<AnyProps> | null;

export interface GenericInstanceMethods {
    dependsOn?: DependsOnMethod;
    deployedWhen?: DeployedWhenMethod;
}

export interface GenericInstance extends GenericInstanceMethods {
    [key: string]: any;
}

// Unique ID for an element. Currently AdaptElement.id.
export type ElementID = string;

export interface AdaptMountedElement<P extends object = AnyProps> extends AdaptElement<P> {
    readonly props: P & Required<BuiltinProps>;
    readonly id: ElementID;
    readonly path: string;
    readonly keyPath: KeyPath;
    readonly buildData: BuildData;
    readonly instance: GenericInstance;

    dependsOn: DependsOnMethod;
    deployedWhen: DeployedWhenMethod;
    status<T extends Status>(o?: ObserveForStatus): Promise<T>;
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
    return isInstance(val, AdaptDeferredElementImpl, "adapt");
}

export interface AdaptPrimitiveElement<P extends object = AnyProps> extends AdaptDeferredElement<P> {
}
export function isPrimitiveElement<P extends object>(elem: AdaptElement<P>): elem is AdaptPrimitiveElement<P> {
    return isPrimitive(elem.componentType.prototype);
}

export interface AdaptMountedPrimitiveElement<P extends object = AnyProps>
    extends AdaptPrimitiveElement<P>, AdaptMountedElement<P> {
    readonly props: P & Required<BuiltinProps>;
    readonly componentType: PrimitiveClassComponentTyp<P>;

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
export interface AdaptSFCElement<P extends object = AnyProps> extends AdaptElement<P> {
    readonly componentType: FunctionComponentTyp<P>;
}
export function isSFCElement<P extends object = AnyProps>(val: any): val is AdaptSFCElement<P> {
    return isElement(val) && !isComponentElement(val);
}

/*
 * Type info for the Elements returned from dom.build. These types are
 * intended to convey semantic meaning--that whomever uses these types is
 * intending to deal with a built DOM. They also add a level of indirection,
 * should we choose to modify the types somehow in the future.
 */
export type FinalDomElement<P extends object = AnyProps> = AdaptMountedPrimitiveElement<P>;
export type PartialFinalDomElement<P extends object = AnyProps> = AdaptMountedElement<P>;
export const isFinalDomElement = isMountedPrimitiveElement;
export const isPartialFinalDomElement = isMountedElement;

export function componentStateNow<
    C extends Component<P, S>,
    P extends object,
    S extends object>(c: C): S | undefined {
    try {
        return c.state;
    } catch {
        return undefined;
    }
}

export interface DeployInfo {
    deployID: string;
    deployOpID: DeployOpID;
}

export interface BuildHelpers extends DeployInfo, BuildId {
    elementStatus<T = Status>(handle: Handle): Promise<T | undefined>;
}

export abstract class Component<Props extends object = {}, State extends object = {}>
    implements GenericInstanceMethods {

    deployInfo: DeployInfo;

    dependsOn?: DependsOnMethod;
    deployedWhen?: DeployedWhenMethod;

    // cleanup gets called after build of this component's
    // subtree has completed.
    cleanup?: (this: this) => void;

    private stateUpdates: StateUpdater<Props, State>[];
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

    // NOTE(mark): This really should be just BuiltinProps with both key
    // and handle required, but there's some strange interaction between
    // ElementClass and LibraryManagedAttributes in the JSX namespace that
    // I don't understand at the moment where I can't seem to make the
    // Component constructor require it without also making key and handle
    // unintentionally required in all JSX expressions.

    constructor(readonly props: Props & Partial<BuiltinProps>) {
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
        this.stateUpdates = cData.stateUpdates as any;
        this.deployInfo = cData.deployInfo;

        // Prevent subclass constructors from accessing this.state too early
        // by waiting to init getState.
        this.getState = cData.getState;
    }

    ready(helpers: BuildHelpers): boolean | Promise<boolean> { return true; }

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

    abstract build(helpers: BuildHelpers): AdaptElementOrNull | Promise<AdaptElementOrNull>;
    status(observeForStatus: ObserveForStatus, buildData: BuildData): Promise<unknown> {
        return defaultStatus(this.props, observeForStatus, buildData);
    }
}
tagConstructor(Component, "adapt");

export type PropsType<Comp extends Constructor<Component<any, any>>> =
    Comp extends Constructor<Component<infer CProps, any>> ? CProps :
    never;

export abstract class DeferredComponent<Props extends object = {}, State extends object = {}>
    extends Component<Props, State> { }
tagConstructor(DeferredComponent, "adapt");

export function isDeferred<P extends object, S extends object>(component: Component<P, S>):
    component is DeferredComponent<P, S> {
    return isInstance(component, DeferredComponent, "adapt");
}

export abstract class PrimitiveComponent<Props extends object = {}, State extends object = {}>
    extends DeferredComponent<Props, State> {

    build(): AdaptElementOrNull { throw new BuildNotImplemented(); }
    validate(): string | string[] | undefined { return; }
}
tagConstructor(PrimitiveComponent, "adapt");

export function isPrimitive<P extends object>(component: Component<P>):
    component is PrimitiveComponent<P> {
    return isInstance(component, PrimitiveComponent, "adapt");
}

export interface SFC<Props extends object = AnyProps> {
    (props: Props & Partial<BuiltinProps>): AdaptElementOrNull;
    defaultProps?: Partial<Props>;
    status?: (props: Props & BuiltinProps, observe: ObserveForStatus, buildData: BuildData) => Promise<unknown>;
}

/**
 * Helper type for declaring the props argument of a function component.
 * (The type that users of your component will see.)
 *
 * @remarks
 * This helper type can be used to create the type for your function
 * component's `props` argument. It correctly handles the standard
 * set of {@link BuiltinProps} and your component's `defaultProps` so that
 * users of your component can pass in props like `key` and `handle` and also
 * not be required to pass in any props that are required, but have valid
 * default values in `defaultProps`.
 *
 * This type should **only** be used to describe the first argument to your
 * function component.
 *
 * It should typically be used along with {@link SFCBuildProps}.
 *
 * Type parameters:
 *
 * `Props` - The object type that describes the props your function
 * component takes, not including any {@link BuiltinProps}. For props that
 * your component requires, but has valid defaults set in `defaultProps`,
 * those properties should be required (not optional) in `Props`.
 *
 * `Defaults` - The object type of your component's `defaultProps`.
 *
 * @example
 * ```tsx
 * interface MyProps {
 *   required: string;   // User is required to always set this prop
 *   hasDefault: string; // User can optionally set this prop or get default
 *   optional?: string;  // User can optionally set this prop, but no default
 * }
 * const defaultProps = {
 *   hasDefault: "thedefault"
 * }
 *
 * // Types for the properties of the props argument below are:
 * //   props.required     string [required]
 * //   props.hasDefault   string [optional]
 * //   props.optional     string [optional]
 * //   props.key          string [optional]
 * //   props.handle       Handle [optional]
 * function MyComponent(props: SFCDeclProps<MyProps, typeof defaultProps) {
 *   // Types for the properties of the buildProps variable below are:
 *   //   buildProps.required     string
 *   //   buildProps.hasDefault   string
 *   //   buildProps.optional     string | undefined
 *   //   buildProps.key          string
 *   //   buildProps.handle       Handle
 *   const buildProps = props as SFCBuildProps<MyProps, typeof defaultProps>;
 *   ...
 * }
 * MyComponent.defaultProps = defaultProps;
 * ```
 * @public
 */
export type SFCDeclProps<Props, Defaults extends object = object> =
    Defaultize<Props, Defaults> & Partial<BuiltinProps>;

/**
 * Helper type for declaring the props available to use **inside** the body
 * of your function component.
 *
 * @remarks
 * This helper type can be used to create the type of the "build props",
 * which are the props available inside the body of your function component
 * when your component is built by Adapt. The type of "build props" in a
 * function component are different than the type that the user sees because
 * Adapt deals with setting the values of some props automatically when
 * a component gets built.
 *
 * This helper should **only** be used to describe the type of a function
 * component's props **inside** the function body.
 *
 * It should typically be used along with {@link SFCDeclProps}. See the
 * example usage of both helper types in {@link SFCDeclProps}.
 *
 * Type parameters:
 *
 * `Props` - The object type that describes the props your function
 * component takes, not including any {@link BuiltinProps}. For props that
 * your component requires, but has valid defaults set in `defaultProps`,
 * those properties should be required (not optional) in `Props`.
 *
 * `Defaults` - (optional) The object type of your component's `defaultProps`.
 */
export type SFCBuildProps<Props, Defaults extends object = object> =
    & {[K in Extract<keyof Props, keyof Defaults>]: Props[K]}
    & {[K in Exclude<RequiredPropertiesT<Props>, keyof Defaults>]: Props[K]}
    & {[K in Exclude<OptionalPropertiesT<Props>, keyof Defaults>]?: Props[K]}
    & Required<BuiltinProps>;

export function isComponent<P extends object, S extends object>(func: SFC | Component<P, S>):
    func is Component<P, S> {
    return isInstance(func, Component, "adapt");
}

export interface ComponentStatic<P> {
    defaultProps?: Partial<P>;
    displayName?: string;
    noPlugin?: boolean;
}
export interface FunctionComponentTyp<P> extends ComponentStatic<P> {
    (props: P & Partial<BuiltinProps>): AdaptElementOrNull;
    status?: (props: P, observe: ObserveForStatus, buildData: BuildData) => Promise<unknown>;
    ready?: (helpers: BuildHelpers) => boolean | Promise<boolean>;
}
export interface ClassComponentTyp<P extends object, S extends object> extends ComponentStatic<P> {
    new(props: P & Partial<BuiltinProps>): Component<P, S>;
}
export interface DeferredClassComponentTyp<P extends object, S extends object> extends ComponentStatic<P> {
    new(props: P & Partial<BuiltinProps>): DeferredComponent<P, S>;
}
export interface PrimitiveClassComponentTyp<P extends object> extends ComponentStatic<P> {
    new(props: P & Partial<BuiltinProps>): PrimitiveComponent<P>;
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
    handle: Handle;
    key?: string;
}

export interface AnyState {
    [key: string]: any;
}

export interface WithChildren {
    children?: any | any[];
}

export type GenericComponent = Component<AnyProps, AnyState>;

export type KeyPath = string[];

export type ElementPredicate = (el: AdaptElement) => boolean;

export class AdaptElementImpl<Props extends object> implements AdaptElement<Props> {
    readonly props: Props & BuiltinProps & WithChildren;

    stateNamespace: StateNamespace = [];
    mounted = false;
    component: GenericComponent | null;
    instanceMethods: GenericInstance = {};
    path?: string;
    keyPath?: KeyPath;
    buildData: Partial<BuildData> = {};
    buildState = BuildState.initial;
    reanimated: boolean = false;
    stateUpdates: StateUpdater[] = [];

    constructor(
        readonly componentType: ComponentType<Props>,
        props: Props & Partial<BuiltinProps>,
        children: any[]) {

        const hand = props.handle || handle();
        if (!isHandleInternal(hand)) throw new InternalError(`handle is not a HandleImpl`);
        hand.associate(this);

        this.props = {
            // https://github.com/Microsoft/TypeScript/pull/13288
            ...props as any,
            handle: hand,
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

    mount(parentNamespace: StateNamespace, path: string, keyPath: KeyPath,
        deployID: string, deployOpID: DeployOpID) {

        if (this.mounted) {
            throw new Error("Cannot remount elements!");
        }
        if ("key" in this.props) {
            const propsWithKey = this.props as Props & { key: string };
            this.stateNamespace = [...parentNamespace, propsWithKey.key];
        } else {
            throw new InternalError(`props has no key at mount: ${util.inspect(this)}`);
        }
        this.path = path;
        this.keyPath = keyPath;
        this.mounted = true;
        this.buildData.id = this.id;
        this.buildData.deployID = deployID;
        this.buildData.deployOpID = deployOpID;
    }

    setBuilt = () => this.buildState = BuildState.built;
    shouldBuild = () => this.buildState === BuildState.initial;
    built = () => this.buildState === BuildState.built;

    setState = (stateUpdate: StateUpdater<Props, AnyState>): void => {
        this.stateUpdates.push(stateUpdate);
    }

    async postBuild(stateStore: StateStore): Promise<{ stateChanged: boolean }> {
        return {
            stateChanged: await applyStateUpdates(this.stateNamespace, stateStore,
                this.props, this.stateUpdates)
        };
    }

    getStatusMethod = (): ((o: ObserveForStatus, b: BuildData) => Promise<any>) => {
        if (isSFCElement(this)) {
            const customStatus = this.componentType.status;
            if (customStatus) {
                return (observeForStatus, buildData) => customStatus(this.props, observeForStatus, buildData);
            }
            return (observeForStatus, buildData) => defaultStatus(this.props, observeForStatus, buildData);
        }
        return (o, b) => {
            if (!this.component) throw new NoStatusAvailable(`element.component === ${this.component}`);
            return this.component.status(o, b);
        };
    }

    statusCommon = async (observeForStatus: ObserveForStatus) => {
        if (this.reanimated && !this.built()) {
            throw new NoStatusAvailable("status for reanimated elements not supported without a DOM build");
        }
        if (!this.mounted) throw new NoStatusAvailable(`element is not mounted`);

        const buildData = this.buildData as BuildData; //After build, this type assertion should hold
        if (buildData === undefined) throw new Error(`Status requested but no buildData: ${this}`);

        const statusMethod = this.getStatusMethod();
        return statusMethod(observeForStatus, buildData);
    }

    statusWithMgr = async (mgr: ObserverManagerDeployment) => {
        const observeForStatus: ObserveForStatus = async (observer, query, variables) => {
            const result = await mgr.executeQuery(observer, query, variables);
            if (result.errors) {
                const badErrors = result.errors.filter((e) => !e.message.startsWith("Adapt Observer Needs Data:"));
                if (badErrors.length !== 0) {
                    const msgs = badErrors.map((e) => e.originalError ? e.stack : gqlPrintError(e)).join("\n");
                    throw new Error(msgs);
                }
                const needMsgs = result.errors.map((e) => e.originalError ? e.stack : gqlPrintError(e)).join("\n");
                throw new ObserverNeedsData(needMsgs);
            }
            return result.data;
        };
        return this.statusCommon(observeForStatus);
    }

    status = async (o?: ObserveForStatus) => {
        const observeForStatus: ObserveForStatus = async (observer, query, variables) => {
            //FIXME(manishv) Make this collect all queries and then observe only once - may require interface change
            const plugin = findObserver(observer);
            if (!plugin) throw new Error(`Cannot find observer ${observer.observerName}`);
            const observations = await plugin.observe([{ query, variables }]);
            const schema = plugin.schema;
            const result = await adaptGqlExecute<unknown>(
                schema,
                query,
                observations.data,
                observations.context,
                variables);
            if (result.errors) {
                const msgs = result.errors.map((e) => e.originalError ? e.stack : gqlPrintError(e)).join("\n");
                throw new Error(msgs);
            }
            return result.data;
        };
        return this.statusCommon(o || observeForStatus);
    }

    dependsOn(goalStatus: GoalStatus, helpers: DeployHelpers): DependsOn | undefined {
        if (!this.mounted) {
            throw new InternalError(`dependsOn requested but element is not mounted`);
        }
        const method = this.instance.dependsOn;
        if (!method) return undefined;
        return method(goalStatus, helpers);
    }

    deployedWhen(goalStatus: GoalStatus, helpers: DeployHelpers): WaitStatus | Promise<WaitStatus> {
        if (!this.mounted) {
            throw new InternalError(`deployedWhen requested but element is not mounted`);
        }
        const method = this.instance.deployedWhen;
        if (!method) return true;
        return method(goalStatus, helpers);
    }

    get componentName() { return this.componentType.name || "anonymous"; }
    get displayName() { return this.componentType.displayName || this.componentName; }
    get id() { return JSON.stringify(this.stateNamespace); }
    get instance(): GenericInstance {
        return this.component || this.instanceMethods;
    }
}
tagConstructor(AdaptElementImpl, "adapt");

enum BuildState {
    initial = "initial",
    deferred = "deferred",
    built = "built"
}

export class AdaptDeferredElementImpl<Props extends object> extends AdaptElementImpl<Props> {
    setDeferred = () => this.buildState = BuildState.deferred;
    shouldBuild = () => this.buildState === BuildState.deferred; //Build if we've deferred once
}
tagConstructor(AdaptDeferredElementImpl, "adapt");

export class AdaptPrimitiveElementImpl<Props extends object> extends AdaptDeferredElementImpl<Props> {
    component: PrimitiveComponent<Props> | null;
    constructor(
        readonly componentType: PrimitiveClassComponentTyp<Props>,
        props: Props & Partial<BuiltinProps>,
        children: any[]
    ) {
        super(componentType, props, children);
    }

    validate(): Message[] {
        if (!this.mounted) {
            throw new InternalError(`validate called on unmounted component at ${this.path}`
            );
        }
        if (this.component == null) {
            throw new InternalError(`validate called but component instance not created at ${this.path}`);
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
tagConstructor(AdaptPrimitiveElementImpl, "adapt");

export function createElement<Props extends object>(
    ctor: string |
        FunctionComponentTyp<Props> |
        ClassComponentTyp<Props, AnyState>,
    //props should never be null, but tsc will pass null when Props = {} in .js
    //See below for null workaround, exclude null here for explicit callers
    props: ExcludeInterface<Props, Children<any>> & Partial<BuiltinProps>,
    ...children: ChildType<Props>[]): AdaptElement {

    if (typeof ctor === "string") {
        throw new Error("createElement cannot called with string element type");
    }

    let fixedProps = ((props === null) ? {} : props) as Props & Partial<BuiltinProps>;
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

    const elProps = { ...element.props };

    // handle cannot be cloned
    delete elProps.handle;

    const newProps = {
        ...elProps,
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

export type PrimitiveChildType<T> =
    T extends (infer U | (infer U)[])[] ? U :
    T extends (infer V)[][] ? V :
    T extends (infer W)[] ? W :
    T;

export function childrenToArray<T>(propsChildren: T | undefined): PrimitiveChildType<T>[] {
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

export async function isReady(h: BuildHelpers, e: AdaptElement | Handle): Promise<boolean> {
    const hand = isHandle(e) ? e : e.props.handle;
    const elem = hand.mountedOrig;
    if (elem === undefined) throw new Error("element has no mountedOrig!");
    if (elem === null) return true;

    if (!elem.instance.ready) return true;
    return elem.instance.ready(h);
}

export interface ComponentConstructorData {
    deployInfo: DeployInfo;
    getState: () => any;
    setInitialState: <T extends object>(init: T) => void;
    stateUpdates: StateUpdater[];
    observerManager: ObserverManagerDeployment;
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

export function getComponentConstructorData(): ComponentConstructorData {
    const data = ld.last(componentConstructorStack);
    if (data == null) {
        throw new InternalError(`componentConstructorStack is empty`);
    }
    return data;
}
