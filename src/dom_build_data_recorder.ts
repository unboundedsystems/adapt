import {
    UnbsElement
} from "./jsx";

import {
    StyleRule
} from "./css";

export type BuildOp =
    | BuildOpStart
    | BuildOpStep
    | BuildOpElementBuilt
    | BuildOpDescend
    | BuildOpAscend
    | BuildOpElementDone
    | BuildOpDone
    | BuildOpError;

export interface BuildOpStart {
    type: "start";
    root: UnbsElement;
}
export interface BuildOpStep {
    type: "step";
    oldElem: UnbsElement;
    newElem: UnbsElement | null;
    style?: StyleRule;
}

export interface BuildOpElementBuilt {
    type: "elementBuilt";
    oldElem: UnbsElement;
    newElem: UnbsElement | null;
}

export interface BuildOpDescend {
    type: "descend";
    descendFrom: UnbsElement;
    descendTo: UnbsElement;
}

export interface BuildOpAscend {
    type: "ascend";
    ascendTo: UnbsElement;
    ascendFrom: UnbsElement;
}

export interface BuildOpElementDone {
    type: "elementDone";
    elem: UnbsElement;
}

export interface BuildOpDone {
    type: "done";
    root: UnbsElement | null;
}

export interface BuildOpError {
    type: "error";
    //FIXME(manishv) Add element that had error here, ugh requires lots of throw catch
    error: any;
}

export type BuildListener = (op: BuildOp) => void;
