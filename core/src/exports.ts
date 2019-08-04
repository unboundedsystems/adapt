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

export * from "./hooks";
export * from "./jsx_namespace";
export {
    childrenToArray,
    cloneElement,
    createElement,
    Component,
    DeferredComponent,
    PrimitiveComponent,
    AdaptElement,
    AdaptMountedElement,
    AdaptElementOrNull,
    AdaptPrimitiveElement,
    AnyProps,
    AnyState,
    BuildHelpers,
    FinalDomElement,
    GenericInstance,
    GenericInstanceMethods,
    BuiltinProps,
    ElementPredicate,
    PartialFinalDomElement,
    isApplyStyle,
    isFinalDomElement,
    isElement,
    isPartialFinalDomElement,
    isMountedElement,
    isDeferredElement,
    isPrimitiveElement,
    isReady,
    WithChildren,
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
    BuildOutput,
    DomPath
} from "./dom";

export {
    concatStyles,
    Style,
    StyleBuildInfo,
    rule,
    ruleNoRematch,
    findElementsInDom,
    findPathsInDom
} from "./css";

export {
    serializeDom,
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
    Context,
    createContext,
    useContext
} from "./context";

export {
    stack,
} from "./stack";

export {
    StateStore,
    createStateStore
} from "./state";

export * from "./ops";

export {
    registerObserver,
    gql,
    Observer,
    ObserverPlugin,
    ObserverResponse,
    ObserverNeedsData,
    ExecutedQuery,
    throwObserverErrors,
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
    ObserveForStatus,
    Status,
} from "./status";

export {
    Children
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
