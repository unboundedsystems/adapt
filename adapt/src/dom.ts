import * as util from "util";

import * as ld from "lodash";

import * as css from "./css";

import {
    AnyProps,
    AnyState,
    childrenToArray,
    ClassComponentTyp,
    cloneElement,
    createElement,
    FunctionComponentTyp,
    isElementImpl,
    isPrimitive,
    isPrimitiveElement,
    simplifyChildren,
    UnbsElement,
    UnbsElementImpl,
    UnbsElementOrNull,
    WithChildren,
} from "./jsx";

import {
    createStateStore, StateNamespace, stateNamespaceForPath, StateStore
} from "./state";

import { DomError } from "./builtin_components";
import {
    BuildListener,
    BuildOp,
} from "./dom_build_data_recorder";
import { BuildNotImplemented } from "./error";
import { assignKeysAtPlacement, computeMountKey } from "./keys";

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
    buildErr = false;
    contents: UnbsElementOrNull = null;
    messages: Message[] = [];
    cleanups: CleanupFunc[] = [];
    mountedElements: UnbsElement[] = [];

    combine(other: ComputeContents) {
        this.messages.push(...other.messages);
        this.cleanups.push(...other.cleanups);
        this.mountedElements.push(...other.mountedElements);
        other.messages = [];
        other.cleanups = [];
        other.mountedElements = [];
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

function makeDomError(element: UnbsElement, err: Error): { domError: UnbsElement<{}>, message: string } {
    let message =
        `Component ${element.componentType.name} cannot be ` +
        `built with current props`;
    if (err.message) message += ": " + err.message;
    const domError = createElement(DomError, {}, message);
    return { domError, message };
}

function computeContentsFromElement<P extends object>(
    element: UnbsElement<P & WithChildren>,
    state: StateStore): ComputeContents {
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

    const component = new (element.componentType as ClassComponentTyp<P, AnyState>)(element.props);
    if (isElementImpl(element)) {
        element.component = component;
        const prevState = state.elementState(element.stateNamespace);
        if (prevState != null) {
            (component as any).state = prevState;
        }
    }

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
        ret.buildDone = true;
        ret.contents = element;
        if (err) {
            ret.buildErr = true;
            const kids = childrenToArray(element.props.children);
            const { domError, message } = makeDomError(element, err);
            ret.messages.push({ type: MessageType.warning, content: message });
            kids.unshift(domError);
            replaceChildren(element, kids);
        }
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
    options: BuildOptionsReq): ComputeContents {

    const element = ld.last(path);
    if (element == null) {
        const ret = new ComputeContents();
        ret.buildDone = true;
        return ret;
    }

    const out = computeContentsFromElement(element, options.stateStore);

    options.recorder({
        type: "step",
        oldElem: element,
        newElem: out.contents
    });

    return out;
}

function ApplyStyle(
    props: {
        override: css.BuildOverride<AnyProps>,
        element: UnbsElement
    }) {

    const origBuild = () => {
        return props.element;
    };

    return props.override(props.element.props, {
        origBuild,
        origElement: props.element
    });
}

function doOverride(
    path: UnbsElement[],
    key: string,
    styles: css.StyleList,
    options: BuildOptionsReq): UnbsElement {

    const element = ld.last(path);
    if (element == null) {
        throw new Error("Cannot match null element to style rules for empty path");
    }

    const overrideFound = findOverride(styles, path);

    if (overrideFound != null) {
        const { style, override } = overrideFound;
        const newElem = createElement(ApplyStyle, { key, override, element });
        options.recorder({
            type: "step",
            oldElem: element,
            newElem,
            style
        });
        return newElem;
    } else {
        return element;
    }
}

function mountElement(
    path: UnbsElement[],
    parentStateNamespace: StateNamespace,
    styles: css.StyleList,
    options: BuildOptionsReq): UnbsElement {

    let elem = ld.last(path);
    if (elem == null) {
        throw new Error(`Cannot mount null element: ${path}`);
    }

    const newKey = computeMountKey(elem, parentStateNamespace);
    elem = doOverride(path, newKey, styles, options);
    elem = cloneElement(elem, { key: newKey }, elem.props.children);
    if (!isElementImpl(elem)) {
        throw new Error("Elements must derive from ElementImpl");
    }
    elem.mount(parentStateNamespace);
    return elem;
}

function subLastPathElem(path: UnbsElement[], elem: UnbsElement): UnbsElement[] {
    const ret = path.slice(0, -1);
    ret.push(elem);
    return ret;
}

function validateComponent(elem: UnbsElement) {
    if (!isPrimitiveElement(elem)) throw new Error("Internal Error: can only validate primitive components");
    try {
        new elem.componentType(elem.props);
    } catch (err) {
        const kids = childrenToArray(elem.props.children);
        kids.unshift(makeDomError(elem, err).domError);
        replaceChildren(elem, kids);
    }
}

function mountAndBuildComponent(
    path: UnbsElement[],
    parentStateNamespace: StateNamespace,
    styles: css.StyleList,
    options: BuildOptionsReq): ComputeContents {

    const elem = mountElement(path, parentStateNamespace, styles, options);
    if ((elem != null) && !isElementImpl(elem)) {
        throw new Error("Elements must derive from ElementImpl");
    }

    if (isPrimitiveElement(elem)) {
        validateComponent(elem);
        const ret = new ComputeContents();
        ret.contents = elem;
        ret.buildDone = true;
        return ret;
    }

    const revisedPath = subLastPathElem(path, elem);

    const out = computeContents(revisedPath, options);
    out.mountedElements.push(elem);

    if (out.contents != null) {
        if (Array.isArray(out.contents)) {
            const comp = elem.componentType;
            throw new Error(`Component build for ${comp.name} returned an ` +
                `array. Components must return a single root element when ` +
                `built.`);
        }

        //Ignore buildDone here because a style rule could cause the build to continue
        if (out.buildErr) {
            return out;
        }

        const newPath = subLastPathElem(path, out.contents);
        const ret = mountAndBuildComponent(newPath, elem.stateNamespace, styles, options);
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
    stateStore?: StateStore;
}

const defaultBuildOptions = {
    depth: -1,
    shallow: false,
    // Next line shouldn't be needed.  VSCode tslint is ok, CLI is not.
    // tslint:disable-next-line:object-literal-sort-keys
    recorder: (_op: BuildOp) => { return; },
    stateStore: createStateStore(),
};

type BuildOptionsReq = Required<BuildOptions>;

export interface BuildOutput {
    contents: UnbsElementOrNull;
    messages: Message[];
}
export function build(
    root: UnbsElement,
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
    let result = null;
    try {
        result = realBuild(path, null, styles, options);
    } catch (error) {
        options.recorder({ type: "error", error });
        throw error;
    }
    options.recorder({ type: "done", root: result.contents });
    result.mountedElements.map((elem) => {
        if (isElementImpl(elem)) {
            elem.postBuild(options.stateStore);
        }
    });
    return {
        contents: result.contents,
        messages: (result.messages) || [],
    };
}

function realBuild(
    path: UnbsElement[],
    parentStateNamespace: StateNamespace | null,
    styles: css.StyleList,
    options: BuildOptionsReq): ComputeContents {

    let out = new ComputeContents();

    if (options.depth === 0) {
        out.contents = path[0];
        return out;
    }

    if (parentStateNamespace == null) {
        parentStateNamespace = stateNamespaceForPath(path.slice(0, -1));
    }

    const oldElem = path[path.length - 1];
    out = mountAndBuildComponent(path, parentStateNamespace, styles, options);
    const newRoot = out.contents;
    options.recorder({ type: "elementBuilt", oldElem, newElem: newRoot });

    if (newRoot == null || atDepth(options, path.length)) {
        return out;
    }

    if (!isElementImpl(newRoot)) {
        throw new Error(`Internal Error: element is not ElementImpl: ${util.inspect(newRoot)}`);
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
        childList = [children];
    } else if (ld.isArray(children)) {
        childList = children;
    }

    assignKeysAtPlacement(childList);
    newChildren = childList.map((child) => {
        if (child instanceof UnbsElementImpl) {
            options.recorder({ type: "descend", descendFrom: newRoot, descendTo: child });
            const ret = realBuild([...path, child], newRoot.stateNamespace, styles, options);
            options.recorder({ type: "ascend", ascendTo: newRoot, ascendFrom: child });
            ret.cleanup(); // Do lower level cleanups before combining msgs
            out.combine(ret);
            return ret.contents;
        } else {
            return child;
        }
    });

    newChildren = newChildren.filter(notNull);

    replaceChildren(newRoot, newChildren);
    return out;
}

function replaceChildren(elem: UnbsElement, children: any | any[] | undefined) {
    children = simplifyChildren(children);

    if (Object.isFrozen(elem.props)) {
        const childMerge = (children == null) ? undefined : { children };
        (elem as any).props = {
            ...elem.props,
            ...childMerge
        };
        Object.freeze(elem.props);
    } else {
        if (children == null) {
            delete elem.props.children;
        } else {
            elem.props.children = children;
        }
    }
}
