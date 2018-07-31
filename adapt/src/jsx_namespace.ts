import { AdaptElement, AnyProps, AnyState, BuiltinProps, Component } from "./jsx";

export namespace JSX {
    export interface IntrinsicElements { }

    export type IntrinsicAttributes = BuiltinProps;

    export type IntrinsicClassAttributes<T> = BuiltinProps;

    export interface ElementAttributesProperty {
        props: never;
    }
    export interface ElementChildrenAttribute {
        children: never;
    }
    export type ElementClass = Component<AnyProps, AnyState>;
    export type Element = AdaptElement;
}
