import * as util from 'util';

import * as ld from 'lodash';

import * as css from './css';

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
import { NOTFOUND } from 'dns';

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

function computeContentsNoOverride(element: UnbsElement): UnbsNode {
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

    return contents;
}

function findOverride(styles: css.Styles, path: UnbsElement[]) {
    const element = path[path.length - 1];
    if (element.props.cssMatched === true) {
        return null;
    }
    for (const style of styles.reverse()) {
        if (style.match(path)) {
            return style.sfc;
        }
    }
    return null;
}

function computeContents(path: UnbsElement[], styles: css.Styles): UnbsNode {
    const override = findOverride(styles, path);
    const element = path[path.length - 1];
    const noOverride = (shallow: boolean = true) => {
        let newPath = path.slice(0, -1);
        newPath.push(cloneElement(element, { cssMatched: true }));
        return realBuild(newPath, styles, shallow);
    };
    if (override != null) {
        return override({ ...element.props, buildOrig: noOverride });
    }
    return computeContentsNoOverride(element);
}

function mountAndBuildComponent(path: UnbsElement[], styles: css.Styles): UnbsNode {
    const contents = computeContents(path, styles);

    if (contents != null) {
        if (isPrimitive(contents.componentType.prototype)) {
            return contents;
        }
        const newPath = path.slice(0, -1);
        newPath.push(contents);
        return mountAndBuildComponent(newPath, styles);
    } else {
        return null;
    }
}

function notNull(x: any): boolean {
    return x != null;
}

export function build(root: UnbsElement,
    styles: css.Styles,
    shallow: boolean = false): UnbsNode {
    return realBuild([root], styles, shallow);
}

function realBuild(
    path: UnbsElement[],
    styles: css.Styles,
    shallow: boolean): UnbsNode {

    const newRoot = mountAndBuildComponent(path, styles);

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
        newChildren = realBuild([...path, children], styles, false);
    } else if (ld.isArray(children)) {
        newChildren = children.map((child) => {
            if (child instanceof UnbsElementImpl) {
                return realBuild([...path, child], styles, false);
            } else {
                return child;
            }
        });
        newChildren = newChildren.filter(notNull);
    }

    return cloneElement(newRoot, {}, ...newChildren);
}