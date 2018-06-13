import * as ld from "lodash";

import * as css from "./css";

import {
    childrenToArray,
    ClassComponentTyp,
    cloneElement,
    createElement,
    FunctionComponentTyp,
    isPrimitive,
    UnbsElement,
    UnbsElementImpl,
    UnbsElementOrNull,
    WithChildren,
} from "./jsx";

import { DomError } from "./builtin_components";
import {
    BuildListener,
    BuildOp,
} from "./dom_build_data_recorder";
import { BuildNotImplemented } from "./error";

export enum MessageType {
    warning = "warning",
    error = "error",
}
export interface Message {
    type: MessageType;
    content: string;
}

type CleanupFunc = () => void;
class ComputeContents {
    buildDone = false;
    contents: UnbsElementOrNull = null;
    messages: Message[] = [];
    cleanups: CleanupFunc[] = [];

    combine(other: ComputeContents) {
        this.messages.push(...other.messages);
        this.cleanups.push(...other.cleanups);
        other.messages = [];
        other.cleanups = [];
    }
    cleanup() {
        let clean: CleanupFunc | undefined;
        do {
            clean = this.cleanups.pop();
            if (clean) clean();
        } while (clean);
    }
}

function isClassConstructorError(err: any) {
    return err instanceof TypeError && typeof err.message === "string" &&
        /Class constructor .* cannot be invoked/.test(err.message);
}

function computeContentsNoOverride<P extends object>(
    element: UnbsElement<P & WithChildren>): ComputeContents {
    const ret = new ComputeContents();

    try {
        ret.contents =
            (element.componentType as FunctionComponentTyp<P>)(element.props);
        return ret;

    } catch (e) {
        if (e instanceof BuildNotImplemented) return buildDone(e);
        if (!isClassConstructorError(e)) throw e;
        // element.componentType is a class, not a function. Fall through.
    }

    const component = new (element.componentType as ClassComponentTyp<P>)(element.props);

    if (isPrimitive(component)) return buildDone();

    try {
        ret.contents = component.build();
        if (component.cleanup) {
            ret.cleanups.push(component.cleanup.bind(component));
        }
        return ret;

    } catch (e) {
        if (e instanceof BuildNotImplemented) return buildDone(e);
        throw e;
    }

    function buildDone(err?: Error) {
        const kids = childrenToArray(element.props.children);
        if (err) {
            let message =
                `Component ${element.componentType.name} cannot be ` +
                `built with current props`;
            if (err.message) message += ": " + err.message;
            ret.messages.push({ type: MessageType.warning, content: message });
            kids.unshift(createElement(DomError, {}, message));
        }
        ret.buildDone = true;
        ret.contents = cloneElement(element, {}, ...kids);
        return ret;
    }
}

function findOverride(styles: css.StyleList, path: UnbsElement[]) {
    const element = path[path.length - 1];
    if (css.ruleIsFinal(element.props)) return null;

    for (const style of styles.reverse()) {
        if (!css.ruleHasMatched(element.props, style) && style.match(path)) {
            css.ruleMatches(element.props, style);
            return { style, override: style.sfc };
        }
    }
    return null;
}

function computeContents(
    path: UnbsElement[],
    styles: css.StyleList,
    options: BuildOptionsReq): ComputeContents {

    let out = new ComputeContents();
    const overrideFound = findOverride(styles, path);
    const element = path[path.length - 1];
    const noOverride = () => {
        const ret = computeContentsNoOverride(element);
        out.combine(ret);
        return ret.contents;
    };

    let style: css.StyleRule | undefined;
    if (overrideFound != null) {
        const override = overrideFound.override;
        style = overrideFound.style;
        out.contents = override(
            element.props,
            { origBuild: noOverride, origElement: element });
    } else {
        out = computeContentsNoOverride(element);
    }

    if (!out.buildDone) {
        options.recorder({
            type: "step",
            oldElem: element,
            newElem: out.contents,
            style
        });
    }
    return out;
}

function mountAndBuildComponent(
    path: UnbsElement[],
    styles: css.StyleList,
    options: BuildOptionsReq): ComputeContents {

    const out = computeContents(path, styles, options);

    if (out.contents != null) {
        if (Array.isArray(out.contents)) {
            const comp = path[path.length - 1].componentType;
            throw new Error(`Component build for ${comp.name} returned an ` +
                `array. Components must return a single root element when ` +
                `built.`);
        }
        if (out.buildDone) return out;

        const newPath = path.slice(0, -1);
        newPath.push(out.contents);
        const ret = mountAndBuildComponent(newPath, styles, options);
        out.combine(ret);
        out.contents = ret.contents;
    }
    return out;
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
    contents: UnbsElementOrNull;
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
    return {
        contents: ret && ret.contents,
        messages: (ret && ret.messages) || [],
    };
}

function realBuild(
    path: UnbsElement[],
    styles: css.StyleList,
    options: BuildOptionsReq): ComputeContents {

    let out = new ComputeContents();

    if (options.depth === 0) {
        out.contents = path[0];
        return out;
    }

    const oldElem = path[path.length - 1];
    out = mountAndBuildComponent(path, styles, options);
    const newRoot = out.contents;
    options.recorder({ type: "elementBuilt", oldElem, newElem: newRoot });

    if (newRoot == null || atDepth(options, path.length)) {
        return out;
    }

    const children = newRoot.props.children;
    let newChildren: any = null;
    if (children == null) {
        return out;
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
            ret.cleanup(); // Do lower level cleanups before combining msgs
            out.combine(ret);
            return ret.contents;
        } else {
            return child;
        }
    });

    newChildren = newChildren.filter(notNull);

    out.contents = cloneElement(newRoot, {}, ...newChildren);
    return out;
}
