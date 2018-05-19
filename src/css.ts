import * as util from 'util';

import cssWhat = require('css-what');

import * as jsx from './jsx'

export type Styles = Style[];

export type SFC = (props: jsx.AnyProps) => jsx.UnbsNode;

export interface Style {
    match(path: jsx.UnbsElement[]): boolean;
    sfc: SFC;
}

export interface RawStyle {
    selector: string;
    build: SFC;
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

    const [_, elem] = last(path);
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

    const [_, elem] = last(path);

    const matcher = matchConfig[selFrag.type];
    if (matcher === undefined) {
        throw new Error("Unsupported selector fragment: " + fragToString(selFrag));
    }
    return matcher(selFrag, path);
}

function notNull<T>(x: T | null): x is T {
    return x != null;
}

function matchWithSelector(
    selector: cssWhat.ParsedSelector,
    path: jsx.UnbsElement[]): boolean {

    for (const block of selector) {
        if (matchBlock(block, path)) {
            return true;
        }
    }
    return false;
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
    for (let i = 1; i < path.length - 1; i++) {
        const tryPath = path.slice(0, -i);
        if (matchWithSelector([selector], tryPath)) {
            return true;
        }
    }
    return false;
}

function matchBlock(
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

        return matchBlock(prefix, newPath);
    }
}

function validateSelector(selector: cssWhat.ParsedSelector) {
    return; //FIXME(manishv) Actuall validate CSS parse tree here
}

function buildStyle(rawStyle: RawStyle): Style {
    const selector = cssWhat(rawStyle.selector, { xmlMode: true });
    validateSelector(selector);
    return {
        match: (path: jsx.UnbsElement[]) =>
            matchWithSelector(selector, path),
        sfc: rawStyle.build
    }
}

export function style(selector: string, build: SFC): RawStyle {
    return { selector, build };
}

export function parseStyles(styles: RawStyle[]): Styles {
    const ret: Styles = [];
    for (const style of styles) {
        ret.push(buildStyle(style));
    }

    return ret;
}
