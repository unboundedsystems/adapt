import * as util from "util";

import * as ld from "lodash";

import * as css from "./css";

import {
    AdaptComponentElement,
    AdaptElement,
    AdaptElementOrNull,
    AnyProps,
    childrenToArray,
    cloneElement,
    Component,
    createElement,
    FunctionComponentTyp,
    isComponentElement,
    isDeferredElementImpl,
    isElement,
    isElementImpl,
    isMountedElement,
    isMountedPrimitiveElement,
    isPrimitiveElement,
    popComponentConstructorData,
    pushComponentConstructorData,
    simplifyChildren,
    WithChildren,
} from "./jsx";

import {
    createStateStore, StateNamespace, stateNamespaceForPath, StateStore
} from "./state";

import { DomError, isDomErrorElement } from "./builtin_components";
import {
    BuildListener,
    BuildOp,
} from "./dom_build_data_recorder";
import { BuildNotImplemented, isError, ThrewNonError } from "./error";
import { assignKeysAtPlacement, computeMountKey } from "./keys";
import { Message, MessageType } from "./utils";

export type DomPath = AdaptElement[];

type CleanupFunc = () => void;
class BuildResults {
    contents: AdaptElementOrNull = null;
    messages: Message[] = [];
    cleanups: CleanupFunc[] = [];
    mountedElements: AdaptElement[] = [];
    builtElements: AdaptElement[] = [];
    stateChanged = false;

    constructor(
        contents?: AdaptElementOrNull,
        other?: BuildResults,
        public buildErr: boolean = false) {

        if (contents !== undefined) {
            this.contents = contents;
        }

        if (other !== undefined) {
            this.combine(other);
        }
    }

    combine(other: BuildResults): BuildResults {
        this.messages.push(...other.messages);
        this.cleanups.push(...other.cleanups);
        this.mountedElements.push(...other.mountedElements);
        this.builtElements.push(...other.builtElements);
        this.buildErr = this.buildErr || other.buildErr;
        this.stateChanged = this.stateChanged || other.stateChanged;
        other.messages = [];
        other.cleanups = [];
        other.builtElements = [];
        other.mountedElements = [];
        return this;
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

function recordDomError(
    cc: BuildResults,
    element: AdaptElement,
    err: Error | Message,
): { domError: AdaptElement<{}>, message: string } {

    let message: Message;
    if (ld.isError(err)) {
        message = {
            type: MessageType.warning,
            timestamp: Date.now(),
            from: "DOM build",
            content:
                `Component ${element.componentType.name} cannot be ` +
                `built with current props` +
                (err.message ? ": " + err.message : "")
        };
    } else {
        message = err;
    }
    const domError = createElement(DomError, {}, message.content);

    cc.buildErr = true;
    const kids = childrenToArray(element.props.children);
    cc.messages.push(message);
    kids.unshift(domError);
    replaceChildren(element, kids);

    return { domError, message: message.content };
}

async function computeContentsFromElement<P extends object>(
    element: AdaptElement<P & WithChildren>,
    state: StateStore): Promise<BuildResults> {
    const ret = new BuildResults();

    try {
        ret.contents =
            (element.componentType as FunctionComponentTyp<P>)(element.props);
        return ret;

    } catch (e) {
        if (e instanceof BuildNotImplemented) return buildDone(e);
        if (!isClassConstructorError(e)) throw e;
        // element.componentType is a class, not a function. Fall through.
    }

    if (!isComponentElement(element)) {
        throw new Error(`Internal error: trying to construct non-component`);
    }
    let component: Component;
    try {
        component = constructComponent(element, state);
    } catch (e) {
        if (e instanceof BuildNotImplemented) return buildDone(e);
        if (isError(e)) {
            return buildDone(new Error(`Component construction failed: ${e.message}`));
        }
        throw e;
    }

    try {
        if (!ld.isFunction(component.build)) {
            throw new BuildNotImplemented(`build is not a function, build = ${util.inspect(component.build)}`);
        }
        ret.contents = await component.build();
        if (component.cleanup) {
            ret.cleanups.push(component.cleanup.bind(component));
        }
        return ret;

    } catch (e) {
        if (e instanceof BuildNotImplemented) return buildDone(e);
        throw e;
    }

    function buildDone(err?: Error) {
        ret.contents = element;
        if (err) recordDomError(ret, element, err);
        return ret;
    }
}

function findOverride(styles: css.StyleList, path: DomPath) {
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

async function computeContents(
    path: DomPath,
    options: BuildOptionsReq): Promise<BuildResults> {

    const element = ld.last(path);
    if (element == null) {
        const ret = new BuildResults();
        return ret;
    }

    const out = await computeContentsFromElement(element, options.stateStore);

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
        element: AdaptElement
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
    path: DomPath,
    key: string,
    styles: css.StyleList,
    options: BuildOptionsReq): AdaptElement {

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
    path: DomPath,
    parentStateNamespace: StateNamespace,
    styles: css.StyleList,
    options: BuildOptionsReq): BuildResults {

    let elem = ld.last(path);
    if (elem === undefined) {
        throw new Error("Internal Error: Attempt to mount empty path");
    }

    if (elem === null) return new BuildResults(elem, undefined, false);

    if (isMountedElement(elem)) {
        throw new Error("Attempt to remount element: " + util.inspect(elem));
    }

    const newKey = computeMountKey(elem, parentStateNamespace);
    elem = doOverride(path, newKey, styles, options);
    elem = cloneElement(elem, { key: newKey }, elem.props.children);
    if (!isElementImpl(elem)) {
        throw new Error("Elements must derive from ElementImpl");
    }
    elem.mount(parentStateNamespace, domPathToString(path));
    const out = new BuildResults(elem, undefined, false);
    out.mountedElements.push(elem);
    return out;
}

function subLastPathElem(path: DomPath, elem: AdaptElement): DomPath {
    const ret = path.slice(0, -1);
    ret.push(elem);
    return ret;
}

async function buildElement(
    path: DomPath,
    parentStateNamespace: StateNamespace,
    styles: css.StyleList,
    options: BuildOptionsReq): Promise<BuildResults> {

    const elem = ld.last(path);
    if (elem === undefined) {
        throw new Error("Internal Error: buildElement called with empty path");
    }

    if (elem === null) return new BuildResults(null, undefined);

    if (!isElementImpl(elem)) {
        throw new Error("Elements must derive from ElementImpl");
    }

    if (isPrimitiveElement(elem)) {
        if (!isElementImpl(elem)) throw new Error("Elements must inherit from ElementImpl");
        const res = new BuildResults(elem);
        try {
            constructComponent(elem, options.stateStore);
            res.builtElements.push(elem);
        } catch (err) {
            if (!isError(err)) throw err;
            recordDomError(res, elem,
                new Error(`Component construction failed: ${err.message}`));
            res.buildErr = true;
        }
        return res;
    }

    const out = await computeContents(path, options);

    if (out.contents != null) {
        if (Array.isArray(out.contents)) {
            const comp = elem.componentType;
            throw new Error(`Component build for ${comp.name} returned an ` +
                `array. Components must return a single root element when ` +
                `built.`);
        }
    }

    out.builtElements.push(elem);
    return out;
}

function constructComponent<P extends object = {}>(
    elem: AdaptComponentElement<P>, stateStore: StateStore): Component<P> {

    if (!isElementImpl(elem)) {
        throw new Error(`Internal error: Element is not an ElementImpl`);
    }

    pushComponentConstructorData({
        getState: () => stateStore.elementState(elem.stateNamespace),
        setInitialState: (init) => stateStore.setElementState(elem.stateNamespace, init),
    });

    try {
        const component = new elem.componentType(elem.props);
        elem.component = component;
        return component;
    } finally {
        popComponentConstructorData();
    }
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

type BuildOptionsReq = Required<BuildOptions>;

function computeOptions(optionsIn?: BuildOptions): BuildOptionsReq {
    const defaultBuildOptions = {
        depth: -1,
        shallow: false,
        // Next line shouldn't be needed.  VSCode tslint is ok, CLI is not.
        // tslint:disable-next-line:object-literal-sort-keys
        recorder: (_op: BuildOp) => { return; },
        stateStore: createStateStore()
    };
    return { ...defaultBuildOptions, ...optionsIn };
}

export interface BuildOutput {
    contents: AdaptElementOrNull;
    messages: Message[];
}
export async function build(
    root: AdaptElement,
    styles: AdaptElementOrNull,
    options?: BuildOptions): Promise<BuildOutput> {

    const styleList = css.buildStyles(styles);
    return pathBuild([root], styleList, options);
}

export async function buildOnce(
    root: AdaptElement,
    styles: AdaptElement | null,
    options?: BuildOptions): Promise<BuildOutput> {

    const styleList = css.buildStyles(styles);
    return pathBuildOnce([root], styleList, options);
}

function atDepth(options: BuildOptionsReq, depth: number) {
    if (options.shallow) return true;
    if (options.depth === -1) return false;
    return depth >= options.depth;
}

async function nextTick(): Promise<void> {
    await new Promise((res) => {
        process.nextTick(res);
    });
}

async function pathBuild(
    path: DomPath,
    styles: css.StyleList,
    optionsIn?: BuildOptions): Promise<BuildOutput> {

    const options = computeOptions(optionsIn);
    const out = new BuildResults();

    const iterOutput = await pathBuildOnceGuts(path, styles, options);
    out.contents = iterOutput.contents;
    out.combine(iterOutput);
    if (iterOutput.buildErr) {
        return out;
    }
    if (out.stateChanged) {
        await nextTick();
        return pathBuild(path, styles, options);
    }
    return out;
}

async function pathBuildOnce(
    path: DomPath,
    styles: css.StyleList,
    optionsIn?: BuildOptions): Promise<BuildOutput> {

    const options = computeOptions(optionsIn);
    const result = await pathBuildOnceGuts(path, styles, options);
    return {
        contents: result.contents,
        messages: (result.messages) || []
    };
}

async function pathBuildOnceGuts(
    path: DomPath,
    styles: css.StyleList,
    options: Required<BuildOptions>): Promise<BuildResults> {

    const root = path[path.length - 1];
    options.recorder({ type: "start", root });
    let result: BuildResults;
    try {
        result = await realBuildOnce(path, null, styles, options);
        result.cleanup();
    } catch (error) {
        options.recorder({ type: "error", error });
        throw error;
    }

    if (result.buildErr) {
        return result;
    }

    result.builtElements.map((elem) => {
        if (isMountedPrimitiveElement(elem)) {
            let msgs: (Message | Error)[];
            try {
                msgs = elem.validate();
            } catch (err) {
                if (!ld.isError(err)) err = new ThrewNonError(err);
                msgs = [err];
            }
            for (const m of msgs) recordDomError(result, elem, m);
        }
    });

    if (result.buildErr) {
        return result;
    }

    options.recorder({ type: "done", root: result.contents });
    result.builtElements.map((elem) => {
        if (isElementImpl(elem)) {
            const { stateChanged } = elem.postBuild(options.stateStore);
            if (stateChanged) {
                result.stateChanged = true;
            }
        }
    });

    return result;
}

async function buildChildren(
    newRoot: AdaptElement,
    workingPath: DomPath,
    styles: css.StyleList,
    options: BuildOptionsReq): Promise<{ newChildren: any, childBldResults: BuildResults }> {

    if (!isElementImpl(newRoot)) throw new Error(`Elements must inherit from ElementImpl ${util.inspect(newRoot)}`);

    const out = new BuildResults();

    const children = newRoot.props.children;
    let newChildren: any = null;
    if (children == null) {
        return { newChildren: null, childBldResults: out };
    }

    //FIXME(manishv) Make this use an explicit stack
    //instead of recursion to avoid blowing the call stack
    //For deep DOMs
    let childList: any[] = [];
    if (isElement(children)) {
        childList = [children];
    } else if (ld.isArray(children)) {
        childList = children;
    }

    assignKeysAtPlacement(childList);
    newChildren = [];
    for (const child of childList) {
        if (isMountedElement(child)) {
            newChildren.push(child); //Must be from a deferred build
            continue;
        }
        if (isElementImpl(child)) {
            options.recorder({ type: "descend", descendFrom: newRoot, descendTo: child });
            const ret = await realBuildOnce([...workingPath, child], newRoot.stateNamespace, styles, options, child);
            options.recorder({ type: "ascend", ascendTo: newRoot, ascendFrom: child });
            ret.cleanup(); // Do lower level cleanups before combining msgs
            out.combine(ret);
            newChildren.push(ret.contents);
            continue;
        } else {
            newChildren.push(child);
            continue;
        }
    }

    newChildren = newChildren.filter(notNull);
    return { newChildren, childBldResults: out };
}

async function realBuildOnce(
    pathIn: DomPath,
    parentStateNamespace: StateNamespace | null,
    styles: css.StyleList,
    options: BuildOptionsReq,
    workingElem?: AdaptElement): Promise<BuildResults> {

    let deferring = false;
    const atDepthFlag = atDepth(options, pathIn.length);

    if (options.depth === 0) return new BuildResults(pathIn[0], undefined);

    if (parentStateNamespace == null) {
        parentStateNamespace = stateNamespaceForPath(pathIn.slice(0, -1));
    }

    const oldElem = ld.last(pathIn);
    if (oldElem === undefined) throw new Error("Internal Error: realBuild called with empty path");
    if (oldElem === null) return new BuildResults(null, undefined);
    if (workingElem === undefined) {
        workingElem = oldElem;
    }

    const out = new BuildResults();
    let mountedElem: AdaptElementOrNull = oldElem;
    if (!isMountedElement(oldElem)) {
        const mountOut = mountElement(pathIn, parentStateNamespace, styles, options);
        if (mountOut.buildErr) return mountOut;
        out.contents = mountedElem = mountOut.contents;
        out.combine(mountOut);
    }

    if (mountedElem === null) {
        options.recorder({ type: "elementBuilt", oldElem: workingElem, newElem: out.contents });
        return out;
    }

    //Element is mounted
    const mountedPath = subLastPathElem(pathIn, mountedElem);

    let newRoot: AdaptElementOrNull = null;
    let newPath = mountedPath;
    if (!isElementImpl(mountedElem)) {
        throw new Error("Elements must inherit from ElementImpl:" + util.inspect(newRoot));
    }

    if (!isDeferredElementImpl(mountedElem) || mountedElem.shouldBuild()) {
        const computeOut = await buildElement(mountedPath, parentStateNamespace, styles, options);
        out.combine(computeOut);
        out.contents = newRoot = computeOut.contents;

        if (computeOut.buildErr) return out;
        if (newRoot !== null) {
            if (newRoot !== mountedElem) {
                newPath = subLastPathElem(mountedPath, newRoot);
                return (await realBuildOnce(
                    newPath,
                    mountedElem.stateNamespace,
                    styles,
                    options,
                    workingElem)).combine(out);
            }
        }
    } else {
        deferring = true;
        mountedElem.deferred();
        newRoot = mountedElem;
        out.contents = newRoot;
    }

    if (newRoot === null) {
        options.recorder({ type: "elementBuilt", oldElem: workingElem, newElem: newRoot });
        return new BuildResults(newRoot, out, true);
    }

    //Do not process children of DomError nodes in case they result in more DomError children
    if (!isDomErrorElement(newRoot)) {
        if (!atDepthFlag) {
            const { newChildren, childBldResults } = await buildChildren(newRoot, mountedPath, styles, options);
            out.combine(childBldResults);

            replaceChildren(newRoot, newChildren);
        }
    } else {
        out.buildErr = true;
    }

    //We are here either because mountedElem was deferred, or because mountedElem === newRoot
    if (!deferring || atDepthFlag) {
        options.recorder({ type: "elementBuilt", oldElem: workingElem, newElem: newRoot });
        return out;
    }

    //FIXME(manishv)? Should this check be if there were no element children instead of just no children?
    //No built event in this case since we've exited early
    if (atDepthFlag && newRoot.props.children === undefined) return out;

    //We must have deferred to get here
    return (await realBuildOnce(newPath, mountedElem.stateNamespace, styles, options, workingElem)).combine(out);
}

function replaceChildren(elem: AdaptElement, children: any | any[] | undefined) {
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

export function domPathToString(domPath: DomPath): string {
    return "/" + domPath.map((el) => el.componentType.name).join("/");
}
