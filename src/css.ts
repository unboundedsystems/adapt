import * as util from 'util';

import cssWhat = require('css-what');

import * as jsx from './jsx'

export type Styles = Style[];

export type SFC = (props: jsx.AnyProps) => jsx.UnbsNode;

export interface Style {
    match(path: jsx.UnbsElement[], elem: jsx.UnbsElement): boolean;
    sfc: SFC;
}

export interface RawStyle {
    selector: string;
    build: SFC;
}

type SelFrag = cssWhat.ParsedSelectorFrag;

interface matchConfigType {
    [type: string]: (frag: SelFrag,
        path: jsx.UnbsElement[],
        elem: jsx.UnbsElement) => boolean;
}

const matchConfig: matchConfigType = {
    "tag": matchTag
}

function last<T>(arr: T[]): T | null {
    if (arr.length == 0) {
        return null;
    }
    return arr[arr.length - 1];
}

function fragToString(frag: SelFrag): string {
    //FIXME(manishv) Actually convert back to CSS syntax
    return util.inspect(frag);
}

function matchTag(frag: SelFrag,
    path: jsx.UnbsElement[], elem: jsx.UnbsElement): boolean {
    if (frag.type != "tag") throw new Error("Internal Error: " + util.inspect(frag));

    //FIXME(manishv) Need proper scoped naming here
    return (elem.componentType.name == frag.name);
}

function matchFrag(
    selFrag: SelFrag,
    path: jsx.UnbsElement[],
    elem: jsx.UnbsElement) {

    const matcher = matchConfig[selFrag.type];
    if (matcher === undefined) {
        throw new Error("Unsupported selector fragment: " + fragToString(selFrag));
    }
    return matcher(selFrag, path, elem);
}

function matchBlock(
    selBlock: cssWhat.ParsedSelectorBlock,
    path: jsx.UnbsElement[],
    elem: jsx.UnbsElement): boolean {

    return selBlock.map((frag) => matchFrag(frag, path, elem)).reduce(((x, y) => x && y), true);
}

function matchWithSelector(
    selector: cssWhat.ParsedSelector,
    path: jsx.UnbsElement[],
    elem: jsx.UnbsElement): boolean {

    const selFrag = last(selector);
    if (selFrag == null) {
        return true; //Empty selector matches everything
    }
    return matchBlock(selFrag, path, elem);
}

function buildStyle(rawStyle: RawStyle): Style {
    const selector = cssWhat(rawStyle.selector, { xmlMode: true });
    return {
        match: (path: jsx.UnbsElement[], elem: jsx.UnbsElement) =>
            matchWithSelector(selector, path, elem),
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
