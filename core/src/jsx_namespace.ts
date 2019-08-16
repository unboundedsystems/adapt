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

import { OptionalPropertiesT, RequiredPropertiesT } from "type-ops";
import { AdaptElement, AnyProps, AnyState, BuiltinProps, Component } from "./jsx";

export type Defaultize<Props, Defaults> =
    & {[K in Extract<keyof Props, keyof Defaults>]?: Props[K]}
    & {[K in Exclude<RequiredPropertiesT<Props>, keyof Defaults>]: Props[K]}
    & {[K in Exclude<OptionalPropertiesT<Props>, keyof Defaults>]?: Props[K]};

export namespace JSX {
    export interface IntrinsicElements { }

    export type IntrinsicAttributes = Partial<BuiltinProps>;

    export interface ElementAttributesProperty {
        props: never;
    }
    export interface ElementChildrenAttribute {
        children: never;
    }
    export type ElementClass = Component<AnyProps, AnyState>;
    export type Element = AdaptElement;

    export type LibraryManagedAttributes<TComponent, Props> =
        (TComponent extends { defaultProps: infer D; } ? Defaultize<Props, D> : Props) & Partial<BuiltinProps>;
}
