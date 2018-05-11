import { UnbsNode } from './jsx';

export namespace JSX {
    export interface IntrinsicElements { }

    export interface ElementAttributesProperty {
        props: never;
    }
    export interface ElementChildrenAttribute {
        children: never;
    }
    export type ElementClass = Element;
    export type Element = UnbsNode;
}