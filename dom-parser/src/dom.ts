import * as ld from "lodash";

export interface AnyProps {
    [key: string]: any;
}

export interface WithChildren {
    children?: any | any[];
}

export function isDOMNode(n: any): n is DOMNode {
    return n instanceof DOMNode;
}

export class DOMNode {
    parent: DOMNode | null = null;
    readonly props: AnyProps & WithChildren;

    constructor(
        readonly componentType: string,
        props: AnyProps,
        readonly uri: string,
        children?: any[]
    ) {
        this.props = ld.clone(props);

        if (children != null) {
            if (children.length !== 0) {
                for (const child of children) {
                    if (isDOMNode(child)) {
                        child.parent = this;
                    }
                }
                this.props.children = (children.length === 1) ?
                    children[0] :
                    children;
            }
        }
    }
}

export class DOMObject {
    constructor(readonly uri: string, readonly data: any) {}
}

export function isDOMObject(n: unknown): n is DOMObject {
    return n instanceof DOMObject;
}
