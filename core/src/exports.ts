/*
 * Copyright 2018-2020 Unbounded Systems, LLC
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

export {
    AnyMethods,
    callFirstInstanceWithMethod,
    callInstanceMethod,
    callNextInstanceMethod,
    callNextInstanceWithMethod,
    hasInstanceMethod,
    SetState,
    HookStateUpdater,
    useAsync,
    useBuildHelpers,
    useDependsOn,
    useDeployedWhen,
    UseDeployedWhenOptions,
    useImperativeMethods,
    useInstanceValue,
    useMethod,
    useMethodFrom,
    useState,
    UseStateInit,
} from "./hooks";
export * from "./jsx_namespace";
export {
    childrenIsEmpty,
    childrenToArray,
    cloneElement,
    createElement,
    Component,
    DeferredComponent,
    PrimitiveComponent,
    AdaptDeferredElement,
    AdaptElement,
    AdaptMountedElement,
    AdaptMountedPrimitiveElement,
    AdaptElementOrNull,
    AdaptPrimitiveElement,
    AnyProps,
    AnyState,
    BuildHelpers,
    ClassComponentTyp,
    ComponentStatic,
    ComponentType,
    defaultDeployedWhen,
    DeferredClassComponentTyp,
    DeployInfo,
    ElementID,
    FinalDomElement,
    FunctionComponentTyp,
    GenericInstance,
    GenericInstanceMethods,
    KeyPath,
    BuiltinProps,
    ElementPredicate,
    PartialFinalDomElement,
    isApplyStyle,
    isFinalDomElement,
    isElement,
    isPartialFinalDomElement,
    isMountedElement,
    isMountedPrimitiveElement,
    isDeferredElement,
    isPrimitiveElement,
    WithChildren,
    PrimitiveChildType,
    PrimitiveClassComponentTyp,
    PropsType,
    SFC,
    SFCBuildProps,
    SFCDeclProps,
} from "./jsx";

export * from "./builtin_components";
export * from "./deploy";
export {
    build,
    BuildData,
    buildOnce,
    BuildOptions,
    BuildOutput,
    BuildOutputBase,
    BuildOutputError,
    BuildOutputPartial,
    BuildOutputSuccess,
    DomPath,
    ProcessStateUpdates,
} from "./dom";

export {
    AdaptComponentConstructor,
    AbstractComponentCtor,
    BuildOverride,
    concatStyles,
    Style,
    StyleBuildInfo,
    StyleList,
    StyleProps,
    StyleRule,
    rule,
    Rule,
    ruleNoRematch,
    findElementsInDom,
    findPathsInDom
} from "./css";

export {
    serializeDom,
    SerializeOptions,
} from "./dom_serialize";

export * from "./dom_build_data_recorder";
export * from "./dom_utils";
export {
    BuildNotImplemented,
    ProjectBuildError,
    ProjectCompileError,
    ProjectRunError,
} from "./error";
export {
    BuildId,
    handle,
    Handle,
    HandleInstanceType,
    isHandle,
} from "./handle";
export { ElementKey, isDefaultKey } from "./keys";
export {
    Consumer,
    ConsumerProps,
    Context,
    createContext,
    Provider,
    ProviderProps,
    useContext
} from "./context";

export {
    stack,
    StyleFunc,
    StyleInput,
} from "./stack";

export {
    createStateStore,
    StateNamespace,
    StateStore,
    StateUpdater,
} from "./state";

export * from "./ops";

export {
    registerObserver,
    gql,
    Observer,
    ObserverManagerDeployment,
    ObserverPlugin,
    ObserverProps,
    ObserverResponse,
    ObserverNameHolder,
    ObserverNeedsData,
    ExecutedQuery,
    throwObserverErrors,
    Variables,
} from "./observers";

export {
    DeployOpID,
} from "./server";
export {
    defaultChildStatus,
    errorToNoStatus,
    gqlGetOriginalErrors,
    mergeDefaultChildStatus,
    NoStatus,
    noStatusOnError,
    noTransform,
    ObserveForStatus,
    Status,
} from "./status";

export {
    Children,
    ChildType,
} from "./type_support";

export {
    Constructor,
    Logger,
    Message,
    MessageLogger,
} from "@adpt/utils";

export {
    deepFilterElemsToPublic
} from "./utils/dom-filter";

import * as internal from "./internal";
export {
    internal,
};
