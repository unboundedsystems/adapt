import * as util from 'util';

import cssWhat = require('css-what');

import * as jsx from './jsx'

export type StyleList = StyleRule[];

export type SFC = (props: jsx.AnyProps) => jsx.UnbsNode;

export type BuildOverride =
    (props: jsx.AnyProps & { buildOrig: () => jsx.UnbsNode }) => jsx.UnbsNode;

export interface StyleRule {
    match(path: jsx.UnbsElement[]): boolean;
    sfc: BuildOverride;
}

export interface RawStyle {
    selector: string;
    build: BuildOverride;
}

type SelFrag = cssWhat.ParsedSelectorFrag;

interface matchConfigType {
    [type: string]: (frag: SelFrag,
        path: jsx.UnbsElement[]) => [jsx.UnbsElement[], boolean];
}

const matchConfig: matchConfigType = {
    "tag": matchTag,
    "child": matchChild,
    "descendant": () => { throw new Error("Internal Error: should not get here"); }
}

function last<T>(arr: T[]): [T[], T | null] {
    if (arr.length <= 0) {
        return [[], null];
    }
    const last = arr[arr.length - 1];
    return [arr.slice(0, -1), last];
}

function fragToString(frag: SelFrag): string {
    //FIXME(manishv) Actually convert back to CSS syntax
    return util.inspect(frag);
}

function matchTag(frag: SelFrag, path: jsx.UnbsElement[]):
    [jsx.UnbsElement[], boolean] {
    if (frag.type !== "tag") throw new Error("Internal Error: " + util.inspect(frag));

    const [, elem] = last(path);
    if (elem == null) throw new Error("Internal error, null element");

    //FIXME(manishv) Need proper scoped naming here
    return [path, elem.componentType.name == frag.name];
}

function matchChild(frag: SelFrag, path: jsx.UnbsElement[]):
    [jsx.UnbsElement[], boolean] {
    if (frag.type !== "child") throw new Error("Internal Error: " + util.inspect(frag));
    if (path.length < 1) return [path, false];
    return [path.slice(0, -1), true];
}

function matchFrag(
    selFrag: SelFrag,
    path: jsx.UnbsElement[]) {

    const matcher = matchConfig[selFrag.type];
    if (matcher === undefined) {
        throw new Error("Unsupported selector fragment: " + fragToString(selFrag));
    }
    return matcher(selFrag, path);
}

function matchDescendant(
    selector: cssWhat.ParsedSelectorBlock,
    path: jsx.UnbsElement[]): boolean {

    if (selector.length <= 0) {
        throw new Error("Internal Error: validated but malformed CSS" +
            util.inspect(selector));
    }

    //Note(manishv) An optimization here is to find the deepest element in path 
    //that matches the next set of selectors up to the next descendant selector
    //and use that path up to that node as tryPath.  If it failse, 
    //use the next deepest, etc.  Not sure that saves much though because that is
    //what happens already, albiet through several function calls.
    for (let i = 1; i < path.length; i++) {
        const tryPath = path.slice(0, -i);
        if (matchWithSelector([selector], tryPath)) {
            return true;
        }
    }
    return false;
}

function matchWithSelector(
    selector: cssWhat.ParsedSelector,
    path: jsx.UnbsElement[]): boolean {

    for (const block of selector) {
        if (matchWithBlock(block, path)) {
            return true;
        }
    }
    return false;
}

function matchWithBlock(
    selBlock: cssWhat.ParsedSelectorBlock,
    path: jsx.UnbsElement[]): boolean {

    const [prefix, selFrag] = last(selBlock);
    if (selFrag == null) {
        return true; //Empty selector matches everything
    }

    if (selFrag.type == "descendant") {
        return matchDescendant(prefix, path);
    } else {
        const [newPath, fragResult] = matchFrag(selFrag, path);
        if (!fragResult) return false;
        if (newPath.length === 0) {
            return false;
        }
        return matchWithBlock(prefix, newPath);
    }
}

function validateSelector(_selector: cssWhat.ParsedSelector) {
    return; //FIXME(manishv) Actuall validate CSS parse tree here
}

function buildStyle(rawStyle: RawStyle): StyleRule {
    const selector = cssWhat(rawStyle.selector, { xmlMode: true });
    validateSelector(selector);
    return {
        match: (path: jsx.UnbsElement[]) =>
            matchWithSelector(selector, path),
        sfc: rawStyle.build
    }
}

function style(selector: string, build: BuildOverride): RawStyle {
    return { selector, build };
}

function parseStyles(styles: RawStyle[]): StyleList {
    const ret: StyleList = [];
    for (const style of styles) {
        ret.push(buildStyle(style));
    }

    return ret;
}

export type UnbsComponentConstructor =
    new (props: jsx.AnyProps) => jsx.Component<jsx.AnyProps>;

export interface StyleProps {
    children: (SFC | string | UnbsComponentConstructor | Rule)[]
}

export class Rule {
    constructor(readonly override: BuildOverride) { }
}

export function rule(override: BuildOverride) {
    return new Rule(override);
}

function isRule(x: any): x is Rule {
    return (typeof x === "object") && (x instanceof Rule);
}

function isStylesComponent(componentType: any):
    componentType is (new (props: StyleProps) => Style) {
    return componentType === Style;
}

export function buildStyles(styleElem: jsx.UnbsElement | null): StyleList {
    if(styleElem == null) {
        return [];
    }
    
    const stylesConstructor = styleElem.componentType;
    if (!isStylesComponent(stylesConstructor)) {
        throw new Error("Invalid Styles element: " + util.inspect(styleElem));
    }

    const props = styleElem.props as StyleProps;
    let curSelector = "";
    let rawStyles: RawStyle[] = [];
    for (const child of props.children) {
        if (typeof child === "function") {
            curSelector = curSelector + child.name
        } else if (typeof child === "string") {
            curSelector += child;
        } else if (isRule(child)) {
            rawStyles.push(style(curSelector.trim(), child.override));
            curSelector = "";
        } else {
            throw new Error("Unsupported child type in Styles: " + util.inspect(child));
        }
    }

    if (curSelector !== "") {
        throw new Error("Missing rule in final style");
    }

    return parseStyles(rawStyles);
}

export class Style extends jsx.Component<StyleProps> {
    build(): null {
        return null; //Don't output anything for styles if it makes it to DOM
    }
}
