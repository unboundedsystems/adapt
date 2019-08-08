import * as util from "util";

import cssWhat = require("css-what");
import * as ld from "lodash";

import { DomPath } from "./dom";
import { InternalError } from "./error";
import { BuildId } from "./handle";
import * as jsx from "./jsx";

export type StyleList = StyleRule[];

export const $matchInfoReg = Symbol.for("$matchInfoReg");
export interface StyleBuildInfo extends BuildId {
    origBuild: jsx.SFC;
    origElement: any;
    [$matchInfoReg]: MatchInfoReg;
}
export type BuildOverride<P = jsx.AnyProps> =
    (props: P & jsx.BuiltinProps, info: StyleBuildInfo) => jsx.AdaptElementOrNull;

export interface StyleRule {
    selector: string;
    sfc: BuildOverride;
    match(path: DomPath): boolean;
}

export interface RawStyle {
    selector: string;
    build: BuildOverride;
}

type SelFrag = cssWhat.ParsedSelectorFrag;

interface Matched {
    newPath: DomPath;
    matched: boolean;
}

interface MatchConfigType {
    [type: string]: (frag: SelFrag, path: DomPath) => Matched;
}

const matchConfig: MatchConfigType = {
    attribute: matchAttribute,
    child: matchChild,
    descendant: () => { throw new InternalError("should not get here"); },
    pseudo: matchPseudo,
    tag: matchTag
};

function last<T>(arr: T[]): { prefix: T[], elem: T | null } {
    if (arr.length <= 0) {
        return { prefix: [], elem: null };
    }
    const lastElem = arr[arr.length - 1];
    return { prefix: arr.slice(0, -1), elem: lastElem };
}

function getPropValue(elem: jsx.AdaptElement, prop: string, ignoreCase: boolean): string | undefined {
    let val: any;

    if (ignoreCase) {
        prop = prop.toLowerCase();
        for (const key of Object.keys(elem.props)) {
            if (key.toLowerCase() === prop) val = elem.props[key];
        }
    } else {
        val = elem.props[prop];
    }
    return typeof val === "string" ? val : undefined;
}

function fragToString(frag: SelFrag): string {
    //FIXME(manishv) Actually convert back to CSS syntax
    return util.inspect(frag);
}

/*
 * Pseudo-classes
 */

const matchPseudoConfig: MatchConfigType = {
    root: matchRoot,
    not: matchNot,
};

function matchPseudo(frag: SelFrag, path: DomPath): Matched {
    if (frag.type !== "pseudo") throw new InternalError(util.inspect(frag));
    const matcher = matchPseudoConfig[frag.name];
    if (matcher == null) throw new Error(`Unsupported CSS pseudo-class :${frag.name}`);
    return matcher(frag, path);
}

function matchNot(frag: SelFrag, path: DomPath): Matched {
    if (frag.type !== "pseudo") throw new InternalError(util.inspect(frag));
    if (frag.data == null || frag.data.length === 0 || frag.data[0].length === 0) {
        throw new Error(`CSS ":not" requires at least one selector argument in parentheses`);
    }

    return { newPath: path, matched: !matchWithSelector(frag.data, path) };
}

function matchRoot(frag: SelFrag, path: DomPath): Matched {
    // NOTE(mark): This implementation for matchRoot depends on path always
    // starting with the actual root element, so therefore path.length is
    // the actual depth of the last element in path. matchChild and
    // matchDecendant both modify path, but always remove from the END of
    // the path.
    return { newPath: path, matched: path.length === 1 };
}

/*
 * Basic selectors
 */

function matchAttribute(frag: SelFrag, path: DomPath): Matched {
    if (frag.type !== "attribute") throw new InternalError(util.inspect(frag));

    const { elem } = last(path);
    if (elem == null) throw new InternalError("null element");

    const value = getPropValue(elem, frag.name, frag.ignoreCase);
    if (value === undefined) return { newPath: path, matched: false };

    let matched: boolean;
    switch (frag.action) {
        case "exists":
            matched = true;
            break;
        case "equals":
            matched = value === frag.value;
            break;
        case "start":
            matched = value.startsWith(frag.value);
            break;
        case "any":
            matched = value.includes(frag.value);
            break;
        case "end":
            matched = value.endsWith(frag.value);
            break;
        case "element":
            matched = value.split(/\s+/).indexOf(frag.value) !== -1;
            break;
        default:
            throw new Error(`CSS attribute selector action '${frag.action}' not supported`);
    }
    return { newPath: path, matched };
}

function matchTag(frag: SelFrag, path: DomPath): Matched {
    if (frag.type !== "tag") throw new InternalError(util.inspect(frag));

    const { elem } = last(path);
    if (elem == null) throw new InternalError("null element");

    return { newPath: path, matched: uniqueName(elem.componentType) === frag.name };
}

/*
 * Combinators
 */
function matchChild(frag: SelFrag, path: DomPath): Matched {
    if (frag.type !== "child") throw new InternalError(util.inspect(frag));
    if (path.length < 1) return { newPath: path, matched: false };
    return { newPath: path.slice(0, -1), matched: true };
}

function matchDescendant(
    selector: cssWhat.ParsedSelectorBlock,
    path: DomPath): boolean {

    if (selector.length <= 0) {
        throw new InternalError(`validated but malformed CSS ${util.inspect(selector)}`);
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

/*
 * Top-level matching
 */

function matchFrag(
    selFrag: SelFrag,
    path: DomPath) {

    const matcher = matchConfig[selFrag.type];
    if (matcher === undefined) {
        throw new Error("Unsupported selector fragment: " + fragToString(selFrag));
    }
    return matcher(selFrag, path);
}

function matchWithSelector(
    selector: cssWhat.ParsedSelector,
    path: DomPath): boolean {

    for (const block of selector) {
        if (matchWithBlock(block, path)) {
            return true;
        }
    }
    return false;
}

function matchWithBlock(
    selBlock: cssWhat.ParsedSelectorBlock,
    path: DomPath): boolean {

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
        match: (path: DomPath) =>
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
    <P extends object = jsx.AnyProps,
    S extends object = jsx.AnyState,
    T extends jsx.Component<P, S> = jsx.Component<P, S>> =
    // tslint:disable-next-line:ban-types
    Function & { prototype: T };

export type AdaptComponentConstructor =
    new (props: jsx.AnyProps) => jsx.Component<jsx.AnyProps, jsx.AnyState>;

export interface StyleProps {
    children: (AbstractComponentCtor | jsx.SFC | string |
        AdaptComponentConstructor | Rule)[];
}

export class Rule<P = jsx.AnyProps> {
    constructor(readonly override: BuildOverride<P>) { }
}

export function rule<P = jsx.AnyProps>(override?: BuildOverride<P>) {
    if (override === undefined) {
        override = (_, i) => i.origElement;
    }
    return new Rule<P>(override);
}

function isRule(x: any): x is Rule {
    return (typeof x === "object") && (x instanceof Rule);
}

/**
 * Keep track of which rules have matched for a set of props so that in the
 * typical case, the same rule won't match the same component instance more
 * than once.
 * @internal
 */
export interface MatchInfo {
    matched?: Set<StyleRule>;
    neverMatch?: true;
}
export type MatchInfoReg = Map<jsx.AdaptElement, MatchInfo>;

export function createMatchInfoReg() {
    return new Map<jsx.AdaptElement, MatchInfo>();
}

function getCssMatched(reg: MatchInfoReg, el: jsx.AdaptElement): MatchInfo {
    let mi = reg.get(el);
    if (mi === undefined) {
        mi = {};
        reg.set(el, mi);
    }
    return mi;
}

export function ruleHasMatched(reg: MatchInfoReg, el: jsx.AdaptElement, r: StyleRule) {
    const m = getCssMatched(reg, el);
    return (m.matched && m.matched.has(r)) === true;
}

export function ruleMatches(reg: MatchInfoReg, el: jsx.AdaptElement, r: StyleRule) {
    const m = getCssMatched(reg, el);
    if (!m.matched) m.matched = new Set<StyleRule>();
    m.matched.add(r);
}

export function neverMatch(reg: MatchInfoReg, el: jsx.AdaptElement) {
    const m = getCssMatched(reg, el);
    m.neverMatch = true;
}

export function canMatch(reg: MatchInfoReg, el: jsx.AdaptElement) {
    const m = getCssMatched(reg, el);
    return m.neverMatch !== true;
}

export function copyRuleMatches(
    reg: MatchInfoReg,
    fromEl: jsx.AdaptElement,
    toEl: jsx.AdaptElement) {
    const from = getCssMatched(reg, fromEl);
    const to = getCssMatched(reg, toEl);

    if (from.neverMatch) {
        to.neverMatch = true;
    } else if (from.matched) {
        if (!to.matched) to.matched = new Set<StyleRule>();
        for (const r of from.matched) {
            to.matched.add(r);
        }
    }
}

/**
 * User API function that can be used in a style rule build function to
 * mark the props of the passed in element such that the rule associated
 * with the info parameter will not match against the specified element.
 *
 * This works by copying the set of all rules that have already matched
 * successfully against the original element (origElement) specified in the
 * info parameter onto the passed in elem.
 * Returns the passed in elem as a convenience. Does not create a new element.
 * @param info - The second argument to a rule callback
 *     function. This indicates which rule to ignore matches of.
 * @param elem - The element that should not match the
 *     specified rule.
 * @public
 */
export function ruleNoRematch(info: StyleBuildInfo, elem: jsx.AdaptElement) {
    if (jsx.isMountedElement(elem)) {
        throw new Error(`elem has already been mounted. elem must be a newly created element`);
    }
    copyRuleMatches(info[$matchInfoReg], info.origElement, elem);
    return elem;
}

function isStylesComponent(componentType: any):
    componentType is (new (props: StyleProps) => Style) {
    return componentType === Style;
}

const objToName = new WeakMap<object, string>();
const uniqueNamePrefix = "UniqueName";
let nextUniqueNameIndex = 0;

function hasName(o: any): o is { name: string } {
    if (Object.hasOwnProperty.apply(o, ["name"])) {
        return ld.isString(o.name);
    }
    return false;
}

function uniqueName(o: object): string {
    let ret = objToName.get(o);

    if (ret === undefined) {
        const objName = hasName(o) ? o.name : "";
        ret = uniqueNamePrefix + nextUniqueNameIndex + objName;
        objToName.set(o, ret);
        nextUniqueNameIndex++;
    }

    return ret;
}

export function buildStyles(styleElem: jsx.AdaptElement | null): StyleList {
    if (styleElem == null) {
        return [];
    }

    const stylesConstructor = styleElem.componentType;
    if (!isStylesComponent(stylesConstructor)) {
        throw new Error("Invalid Styles element: " + util.inspect(styleElem));
    }

    let curSelector = "";
    const rawStyles: RawStyle[] = [];
    for (const child of jsx.childrenToArray(styleElem.props.children)) {
        if (typeof child === "function") {
            curSelector = curSelector + uniqueName(child);
        } else if (typeof child === "string") {
            curSelector += child;
        } else if (isRule(child)) {
            rawStyles.push(makeStyle(curSelector.trim(), child.override));
            curSelector = "";
        } else {
            throw new Error(`Unsupported child type in Styles: "${typeof child}" (value: ${util.inspect(child)})`);
        }
    }

    if (curSelector !== "") {
        throw new Error("Missing rule in final style");
    }

    return parseStyles(rawStyles);
}

//FIXME(manishv) This is horribly slow, use a browser-like right-to-left set-matching algorithm instead
function findInDomImpl(styles: StyleList, path: DomPath):
    DomPath[] {

    const elem = ld.last(path);
    if (elem == null) return [];

    const matches: DomPath[] = [];
    for (const style of styles) {
        if (style.match(path)) {
            matches.push(path);
            break;
        }
    }

    const children = jsx.childrenToArray(elem.props.children);
    for (const child of children) {
        if (jsx.isElement(child)) {
            matches.push(...findInDomImpl(styles, [...path, child]));
        }
    }

    return matches;
}

export function findElementsInDom(
    stylesIn: StyleList | jsx.AdaptElement | null,
    dom: jsx.AdaptElementOrNull): jsx.AdaptElement[] {

    return ld.compact(findPathsInDom(stylesIn, dom)
        .map((path) => ld.last(path)));
}

export function findPathsInDom(
    stylesIn: StyleList | jsx.AdaptElement | null,
    dom: jsx.AdaptElementOrNull): DomPath[] {

    if (stylesIn == null) return [];
    const styles = jsx.isElement(stylesIn) ? buildStyles(stylesIn) : stylesIn;

    if (dom === null) return [];
    return findInDomImpl(styles, [dom]);
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
 * @param styles -
 *   Zero or more Style elements, each containing style rules.
 * @returns
 *   A new Style element containing the concatenation of all
 *   of the rules from the passed in Style elements.
 */
export function concatStyles(
    ...styles: jsx.AdaptElement[]
): jsx.AdaptElement {

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
