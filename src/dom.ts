import * as ld from "lodash";

import * as css from "./css";

import {
    cloneElement,
    Component,
    isPrimitive,
    UnbsElement,
    UnbsElementImpl,
    UnbsNode,
} from "./jsx";

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

function findOverride(styles: css.StyleList, path: UnbsElement[]) {
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

function computeContents(
    path: UnbsElement[],
    styles: css.StyleList,
    options: BuildOptionsReq): UnbsNode {

    const override = findOverride(styles, path);
    const element = path[path.length - 1];
    const noOverride = () => {
        const newPath = path.slice(0, -1);
        newPath.push(cloneElement(element, { cssMatched: true }));
        return pathBuild(newPath, styles, options);
    };
    if (override != null) {
        return override({ ...element.props, buildOrig: noOverride });
    }
    return computeContentsNoOverride(element);
}

function mountAndBuildComponent(
    path: UnbsElement[],
    styles: css.StyleList,
    options: BuildOptionsReq): UnbsNode {

    const contents = computeContents(path, styles, options);

    if (contents != null) {
        if (isPrimitive(contents.componentType.prototype)) {
            return contents;
        }
        const newPath = path.slice(0, -1);
        newPath.push(contents);
        return mountAndBuildComponent(newPath, styles, options);
    } else {
        return null;
    }
}

function notNull(x: any): boolean {
    return x != null;
}

export interface BuildOptions {
    depth?: number;
    shallow?: boolean;
}

const defaultBuildOptions = {
    depth: -1,
    shallow: false
};

type BuildOptionsReq = Required<BuildOptions>;

export function build(root: UnbsElement,
    styles: UnbsElement | null,
    options?: BuildOptions): UnbsNode {

    const styleList = css.buildStyles(styles);

    return pathBuild([root], styleList, options);
}

function atDepth(options: BuildOptionsReq, depth: number) {
    if (options.shallow) return true;
    if (options.depth === -1) return false;
    return depth >= options.depth;
}

function pathBuild(
    path: UnbsElement[],
    styles: css.StyleList,
    options?: BuildOptions) {
    return realBuild(path, styles, { ...defaultBuildOptions, ...options });
}

function realBuild(
    path: UnbsElement[],
    styles: css.StyleList,
    options: BuildOptionsReq): UnbsNode {

    if (options.depth === 0) return path[0];

    const newRoot = mountAndBuildComponent(path, styles, options);

    if (newRoot == null) {
        return newRoot;
    }

    if (atDepth(options, path.length)) {
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
        newChildren = realBuild([...path, children], styles, options);
    } else if (ld.isArray(children)) {
        newChildren = children.map((child) => {
            if (child instanceof UnbsElementImpl) {
                return realBuild([...path, child], styles, options);
            } else {
                return child;
            }
        });
        newChildren = newChildren.filter(notNull);
    }

    return cloneElement(newRoot, {}, ...newChildren);
}
