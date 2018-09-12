import { OptionalPropertiesT, RequiredPropertiesT } from "type-ops";
import { AdaptElement, AnyProps, AnyState, BuiltinProps, Component } from "./jsx";

type Defaultize<Props, Defaults> =
    & {[K in Extract<keyof Props, keyof Defaults>]?: Props[K]}
    & {[K in Exclude<RequiredPropertiesT<Props>, keyof Defaults>]: Props[K]}
    & {[K in Exclude<OptionalPropertiesT<Props>, keyof Defaults>]?: Props[K]};

export namespace JSX {
    export interface IntrinsicElements { }

    export type IntrinsicAttributes = BuiltinProps;

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
