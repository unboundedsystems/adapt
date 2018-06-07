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

export function buildPrinter(): BuildListener {
    let depth = 0;
    function el(elem: UnbsElement | null) {
        return elem ? elem.componentType.name : "null";
    }

    function i() {
        return " ".repeat(depth * 2);
    }

    return function _buildPrinter(op: BuildOp) {

        let msg = `BUILD [${op.type}]: `;
        msg += " ".repeat(13 - op.type.length);

        switch (op.type) {
            case "start":
                depth = 0;
                msg += i() + `root: ${el(op.root)}`;
                break;
            case "step":
                msg += i() + `${el(op.oldElem)} => ${el(op.newElem)}` +
                    ` style: ${op.style ? op.style.selector : "none"}`;
                break;
            case "elementBuilt":
                msg += i() + `${el(op.oldElem)} => ${el(op.newElem)}`;
                break;
            case "descend":
                depth++;
                msg += i() + `${el(op.descendFrom)} => ${el(op.descendTo)}`;
                break;
            case "ascend":
                depth--;
                msg += i() + `${el(op.ascendFrom)} => ${el(op.ascendTo)}`;
                break;
            case "elementDone":
                msg += i() + `${el(op.elem)}`;
                break;
            case "done":
                msg += i() + `${el(op.root)}`;
                break;
            case "error":
                msg += i() + op.error.toString();
                break;
        }
        // tslint:disable-next-line:no-console
        console.log(msg);
    };
}
