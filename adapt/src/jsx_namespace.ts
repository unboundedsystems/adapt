import { AnyProps, AnyState, Component, UnbsElement } from "./jsx";

export namespace JSX {
    export interface IntrinsicElements { }

    export interface ElementAttributesProperty {
        props: never;
    }
    export interface ElementChildrenAttribute {
        children: never;
    }
    export type ElementClass = Component<AnyProps, AnyState>;
    export type Element = UnbsElement;
}
