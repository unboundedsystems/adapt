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

import {
    BuildListener,
    BuildOp,
} from "./dom_build_data_recorder";

function computeContentsNoOverride(element: UnbsElement): { wasPrimitive: boolean, contents: UnbsNode } {
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
                return {
                    wasPrimitive: true,
                    contents: cloneElement(element, {}, ...element.props.children)
                };
            } else {
                return {
                    wasPrimitive: true,
                    contents: cloneElement(element, {})
                };
            }
        } else {
            contents = component.build();
        }
    }

    return { wasPrimitive: false, contents };
}

function findOverride(styles: css.StyleList, path: UnbsElement[]) {
    const element = path[path.length - 1];
    if (element.props.cssMatched === true) {
        return null;
    }
    for (const style of styles.reverse()) {
        if (style.match(path)) {
            return { style, override: style.sfc };
        }
    }
    return null;
}

function computeContents(
    path: UnbsElement[],
    styles: css.StyleList,
    options: BuildOptionsReq): UnbsNode {

    const overrideFound = findOverride(styles, path);
    const element = path[path.length - 1];
    const noOverride = () => {
        return computeContentsNoOverride(element).contents;
    };

    let wasPrimitive = false;
    let newElem: UnbsNode = null;
    let style: css.StyleRule | undefined;
    if (overrideFound != null) {
        const override = overrideFound.override;
        style = overrideFound.style;
        newElem = override({ ...element.props, buildOrig: noOverride, origElement: element });
    } else {
        const { wasPrimitive: prim, contents: elem } =
            computeContentsNoOverride(element);
        wasPrimitive = prim;
        newElem = elem;
    }

    if (!wasPrimitive) options.recorder({ type: "step", oldElem: element, newElem, style });
    return newElem;
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
    recorder?: BuildListener;
}

const defaultBuildOptions = {
    depth: -1,
    shallow: false,
    // Next line shouldn't be needed.  VSCode tslint is ok, CLI is not.
    // tslint:disable-next-line:object-literal-sort-keys
    recorder: (_op: BuildOp) => { return; },
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
    optionsIn?: BuildOptions) {

    const options = { ...defaultBuildOptions, ...optionsIn };
    const root = path[path.length - 1];
    options.recorder({ type: "start", root });
    let ret = null;
    try {
        ret = realBuild(path, styles, options);
    } catch (error) {
        options.recorder({ type: "error", error });
        throw error;
    }
    options.recorder({ type: "done", root: ret });
    return ret;
}

function realBuild(
    path: UnbsElement[],
    styles: css.StyleList,
    options: BuildOptionsReq): UnbsNode {

    if (options.depth === 0) return path[0];

    const oldElem = path[path.length - 1];
    const newRoot = mountAndBuildComponent(path, styles, options);
    options.recorder({ type: "elementBuilt", oldElem, newElem: newRoot });

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
    let childList: any[] = [];
    if (children instanceof UnbsElementImpl) {
        childList = [newChildren];
    } else if (ld.isArray(children)) {
        childList = children;
    }

    newChildren = childList.map((child) => {
        if (child instanceof UnbsElementImpl) {
            options.recorder({ type: "descend", descendFrom: newRoot, descendTo: child });
            const ret = realBuild([...path, child], styles, options);
            options.recorder({ type: "ascend", ascendTo: newRoot, ascendFrom: child });
            return ret;
        } else {
            return child;
        }
    });

    newChildren = newChildren.filter(notNull);

    return cloneElement(newRoot, {}, ...newChildren);
}
