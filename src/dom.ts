import * as util from 'util';

import * as ld from 'lodash';

import {
    UnbsElement,
    Component,
    UnbsNode,
    UnbsElementImpl,
    isPrimitive,
    cloneElement,
    PrimitiveComponent
} from './jsx';
import * as tySup from './type_support';

class BuildState {
    root: UnbsNode;
    work: (() => void)[] = [];
    get done(): boolean {
        return this.work.length === 0;
    }
}

function elementIsImpl(element: UnbsElement): element is UnbsElementImpl {
    return element instanceof UnbsElementImpl;
}

function mountAndBuildComponent(element: UnbsElement): UnbsNode {
    let component: Component<any> | null = null;
    let contents: UnbsNode = null;

    try {
        contents = element.componentType(element.props);
    } catch (e) {
        component = new element.componentType(element.props);
    }

    if (component != null) {
        if (isPrimitive(component)) {
            if (element.props.children != null) {
                return cloneElement(element, {}, ...element.props.children);
            } else {
                return cloneElement(element, {});
            }
        } else {
            contents = component.build();
        }
    }

    if (contents
         != null) {
        return mountAndBuildComponent(contents);
    } else {
        return null;
    }
}

function notNull(x: any): boolean {
    return x != null;
}

export function build(root: UnbsElement, shallow: boolean = false): UnbsNode {
    const newRoot = mountAndBuildComponent(root);

    if (shallow) {
        return newRoot;
    }

    if (newRoot == null) {
        return newRoot;
    }

    const children = newRoot.props.children;
    let newChildren: any = null;
    if (children == null) {
        return newRoot;
    }

    //FIXME(manishv) Make this use an explicit stack 
    //instead of recursion to avoid blowing the call stack
    //For deep DOMs
    if (children instanceof UnbsElementImpl) {
        newChildren = build(children);
    } else if (ld.isArray(children)) {
        newChildren = children.map((child) => {
            if (child instanceof UnbsElementImpl) {
                return build(child);
            } else {
                return child;
            }
        });
        newChildren = newChildren.filter(notNull);
    }

    return cloneElement(newRoot, {}, ...newChildren);
}