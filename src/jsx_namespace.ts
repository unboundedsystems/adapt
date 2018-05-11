import { Component, UnbsNode } from './jsx';

export namespace JSX {
    export interface IntrinsicElements { }

    export interface ElementAttributesProperty {
        props: never;
    }
    export interface ElementChildrenAttribute {
        children: never;
    }
    export type ElementClass = Component<any>;
    export type Element = UnbsNode;
}