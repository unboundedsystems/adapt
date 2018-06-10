import * as util from "util";

import cssWhat = require("css-what");

import * as jsx from "./jsx";

export type StyleList = StyleRule[];

export interface StyleBuildInfo {
    origBuild: jsx.SFC;
    origElement: any;
}
export type BuildOverride<P = jsx.AnyProps> =
    (props: P, info: StyleBuildInfo)  => jsx.UnbsNode;

export interface StyleRule {
    selector: string;
    sfc: BuildOverride;
    match(path: jsx.UnbsElement[]): boolean;
}

export interface RawStyle {
    selector: string;
    build: BuildOverride;
}

type SelFrag = cssWhat.ParsedSelectorFrag;

interface MatchConfigType {
    [type: string]: (frag: SelFrag,
        path: jsx.UnbsElement[]) => { newPath: jsx.UnbsElement[], matched: boolean };
}

const matchConfig: MatchConfigType = {
    child: matchChild,
    descendant: () => { throw new Error("Internal Error: should not get here"); },
    tag: matchTag
};

function last<T>(arr: T[]): { prefix: T[], elem: T | null } {
    if (arr.length <= 0) {
        return { prefix: [], elem: null };
    }
    const lastElem = arr[arr.length - 1];
    return { prefix: arr.slice(0, -1), elem: lastElem };
}

function fragToString(frag: SelFrag): string {
    //FIXME(manishv) Actually convert back to CSS syntax
    return util.inspect(frag);
}

function matchTag(frag: SelFrag, path: jsx.UnbsElement[]): { newPath: jsx.UnbsElement[], matched: boolean } {
    if (frag.type !== "tag") throw new Error("Internal Error: " + util.inspect(frag));

    const { elem } = last(path);
    if (elem == null) throw new Error("Internal error, null element");

    //FIXME(manishv) Need proper scoped naming here
    return { newPath: path, matched: elem.componentType.name === frag.name };
}

function matchChild(frag: SelFrag, path: jsx.UnbsElement[]): { newPath: jsx.UnbsElement[], matched: boolean } {
    if (frag.type !== "child") throw new Error("Internal Error: " + util.inspect(frag));
    if (path.length < 1) return { newPath: path, matched: false };
    return { newPath: path.slice(0, -1), matched: true };
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

    const { prefix, elem: selFrag } = last(selBlock);
    if (selFrag == null) {
        return true; //Empty selector matches everything
    }

    if (selFrag.type === "descendant") {
        return matchDescendant(prefix, path);
    } else {
        const { newPath, matched } = matchFrag(selFrag, path);
        if (!matched) return false;
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
        selector: rawStyle.selector,
        sfc: rawStyle.build,
        match: (path: jsx.UnbsElement[]) =>
            matchWithSelector(selector, path)
    };
}

function makeStyle(selector: string, build: BuildOverride): RawStyle {
    return { selector, build };
}

function parseStyles(styles: RawStyle[]): StyleList {
    const ret: StyleList = [];
    for (const style of styles) {
        ret.push(buildStyle(style));
    }

    return ret;
}
export type AbstractComponentCtor
    <P = jsx.AnyProps, T extends jsx.Component<P> = jsx.Component<P>> =
    // tslint:disable-next-line:ban-types
    Function & { prototype: T };

export type UnbsComponentConstructor =
    new (props: jsx.AnyProps) => jsx.Component<jsx.AnyProps>;

export interface StyleProps {
    children: (AbstractComponentCtor | jsx.SFC | string |
               UnbsComponentConstructor | Rule)[];
}

export class Rule<P = jsx.AnyProps> {
    constructor(readonly override: BuildOverride<P>) { }
}

export function rule<P = jsx.AnyProps>(override: BuildOverride<P>) {
    return new Rule<P>(override);
}

function isRule(x: any): x is Rule {
    return (typeof x === "object") && (x instanceof Rule);
}

function isStylesComponent(componentType: any):
    componentType is (new (props: StyleProps) => Style) {
    return componentType === Style;
}

export function buildStyles(styleElem: jsx.UnbsElement | null): StyleList {
    if (styleElem == null) {
        return [];
    }

    const stylesConstructor = styleElem.componentType;
    if (!isStylesComponent(stylesConstructor)) {
        throw new Error("Invalid Styles element: " + util.inspect(styleElem));
    }

    const props = styleElem.props as StyleProps;
    let curSelector = "";
    const rawStyles: RawStyle[] = [];
    for (const child of props.children) {
        if (typeof child === "function") {
            curSelector = curSelector + child.name;
        } else if (typeof child === "string") {
            curSelector += child;
        } else if (isRule(child)) {
            rawStyles.push(makeStyle(curSelector.trim(), child.override));
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

/**
 * Concatenate all of the rules of the given Style elements
 * together into a single Style element that contains all of the
 * rules. Always returns a new Style element and does not modify
 * the Style element parameters.
 *
 * @export
 * @param {...jsx.UnbsElement[]} styles
 *   Zero or more Style elements, each containing style rules.
 * @returns {jsx.UnbsElement}
 *   A new Style element containing the concatenation of all
 *   of the rules from the passed in Style elements.
 */
export function concatStyles(
    ...styles: jsx.UnbsElement[]
): jsx.UnbsElement {

    const rules: Rule[] = [];
    for (const styleElem of styles) {
        if (!isStylesComponent(styleElem.componentType)) {
            throw new Error("Invalid Styles element: " +
                            util.inspect(styleElem));
        }
        const kids = styleElem.props.children;
        if (kids == null) continue;
        if (!Array.isArray(kids)) {
            throw new Error(`Invalid type for children of a Style ` +
                            `element: ${typeof kids}`);
        }
        rules.push(...styleElem.props.children);
    }
    return jsx.createElement(Style, {}, rules);
}
