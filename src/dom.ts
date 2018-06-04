import * as ld from "lodash";

import * as css from "./css";

import {
    ClassComponentTyp,
    cloneElement,
    Component,
    FunctionComponentTyp,
    isAbstract,
    isPrimitive,
    UnbsElement,
    UnbsElementImpl,
    UnbsNode,
    WithChildren,
} from "./jsx";

import {
    BuildListener,
    BuildOp,
} from "./dom_build_data_recorder";

export enum MessageType {
    warning = "warning",
    error = "error",
}
export interface Message {
    type: MessageType;
    content: string;
}

interface ComputeContents {
    wasPrimitive: boolean;
    contents: UnbsNode;
    messages: Message[];
}

function computeContentsNoOverride<P extends object>(
    element: UnbsElement<P & WithChildren>): ComputeContents {
    let component: Component<P> | null = null;
    let contents: UnbsNode = null;
    const messages: Message[] = [];

    // The 'as any' below is due to open TS bugs/PR:
    // https://github.com/Microsoft/TypeScript/pull/13288
    const props: P = {
        ...element.componentType.defaultProps as any,
        ...element.props as any
    };

    try {
        contents = (element.componentType as FunctionComponentTyp<P>)(props);
    } catch (e) {
        component = new (element.componentType as ClassComponentTyp<P>)(props);
    }

    if (component != null) {
        const isAbs = isAbstract(component);
        const isPrim = isPrimitive(component);
        if (isAbs) {
            messages.push({
                type: MessageType.warning,
                content: `Component ${element.componentType.name} is ` +
                    `abstract and has no build function`
            });
        }
        if (isPrim || isAbs) {
            if (element.props.children != null) {
                return {
                    wasPrimitive: isPrim,
                    contents: cloneElement(element, {}, ...element.props.children),
                    messages,
                };
            } else {
                return {
                    wasPrimitive: isPrim,
                    contents: cloneElement(element, {}),
                    messages,
                };
            }
        } else {
            contents = component.build();
        }
    }

    return { wasPrimitive: false, contents, messages };
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
    options: BuildOptionsReq): BuildOutput {

    const overrideFound = findOverride(styles, path);
    const element = path[path.length - 1];
    const messages: Message[] = [];
    const noOverride = () => {
        const ret = computeContentsNoOverride(element);
        messages.push(...ret.messages);
        return ret.contents;
    };

    let wasPrimitive = false;
    let newElem: UnbsNode = null;
    let style: css.StyleRule | undefined;
    if (overrideFound != null) {
        const override = overrideFound.override;
        style = overrideFound.style;
        newElem = override(
            { ...element.props, cssMatched: true },
            { origBuild: noOverride, origElement: element });
    } else {
        const ret = computeContentsNoOverride(element);
        wasPrimitive = ret.wasPrimitive;
        newElem = ret.contents;
        messages.push(...ret.messages);
    }

    if (!wasPrimitive) options.recorder({ type: "step", oldElem: element, newElem, style });
    return { contents: newElem, messages };
}

function mountAndBuildComponent(
    path: UnbsElement[],
    styles: css.StyleList,
    options: BuildOptionsReq): BuildOutput {

    const out = computeContents(path, styles, options);

    if (out.contents != null) {
        if (isPrimitive(out.contents.componentType.prototype)) {
            return out;
        }
        if (path.length > 0 && ld.isEqual(out.contents, path[path.length - 1])) {
            // Contents didn't change, typically due to an abstract component
            return out;
        }
        const newPath = path.slice(0, -1);
        newPath.push(out.contents);
        const ret = mountAndBuildComponent(newPath, styles, options);
        out.messages.push(...ret.messages);
        return {...ret, messages: out.messages};
    } else {
        return out;
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

export interface BuildOutput {
    contents: UnbsNode;
    messages: Message[];
}
export function build(root: UnbsElement,
    styles: UnbsElement | null,
    options?: BuildOptions): BuildOutput {

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
    optionsIn?: BuildOptions): BuildOutput {

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
    options.recorder({ type: "done", root: ret.contents });
    return ret;
}

function realBuild(
    path: UnbsElement[],
    styles: css.StyleList,
    options: BuildOptionsReq): BuildOutput {

    if (options.depth === 0) return { contents: path[0], messages: [] };

    const oldElem = path[path.length - 1];
    const { contents: newRoot, messages } = mountAndBuildComponent(path, styles, options);
    options.recorder({ type: "elementBuilt", oldElem, newElem: newRoot });

    if (newRoot == null) {
        return {
            contents: newRoot,
            messages
        };
    }

    if (atDepth(options, path.length)) {
        return {
            contents: newRoot,
            messages
        };
    }

    const children = newRoot.props.children;
    let newChildren: any = null;
    if (children == null) {
        return {
            contents: newRoot,
            messages
        };
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
            messages.push(...ret.messages);
            return ret.contents;
        } else {
            return child;
        }
    });

    newChildren = newChildren.filter(notNull);

    return {
        contents: cloneElement(newRoot, {}, ...newChildren),
        messages
    };
}
