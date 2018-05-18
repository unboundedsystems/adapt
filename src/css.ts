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
    "tag": matchTag
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
    if (frag.type != "tag") throw new Error("Internal Error: " + util.inspect(frag));

    const [_, elem] = last(path);
    if (elem == null) throw new Error("Internal error, null element");

    //FIXME(manishv) Need proper scoped naming here
    return [path, elem.componentType.name == frag.name];
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
function matchBlock(
    selBlock: cssWhat.ParsedSelectorBlock,
    path: jsx.UnbsElement[]): [jsx.UnbsElement[], boolean] {

    const results = selBlock.map((frag) => matchFrag(frag, path));
    const matches = results.map((result) => result[1]).reduce((x, y) => x && y, true);

    let newPath = path;
    const newPaths = results.map((result) => result[0] === path ? null : path).filter(notNull);
    if (newPaths.length > 1) {
        throw new Error("Internal Error: Multiple new paths: " + path + util.inspect(selBlock));
    }
    if (newPaths.length == 1) {
        newPath = newPaths[0];
    }

    return [newPath, matches];
}

function matchWithSelector(
    selector: cssWhat.ParsedSelector,
    path: jsx.UnbsElement[]): boolean {

    const [prefix, selBlock] = last(selector);
    if (selBlock == null) {
        return true; //Empty selector matches everything
    }
    const [newPath, blockResult] = matchBlock(selBlock, path);
    if (!blockResult) return false;

    return matchWithSelector(prefix, newPath);
}

function buildStyle(rawStyle: RawStyle): Style {
    const selector = cssWhat(rawStyle.selector, { xmlMode: true });
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
