import {
    ChangeType,
    FinalDomElement,
    isFinalDomElement,
    PrimitiveComponent,
} from "@usys/adapt";
import { isInstance, MessageLogger, tagConstructor } from "@usys/utils";
import { isObject } from "lodash";
import { isBoolean } from "util";

export interface ShouldActDetail {
    act: boolean;
    detail: string;
}
export type ShouldAct = false | ShouldActDetail;

export function isShouldActDetail(val: any): val is ShouldActDetail {
    return isObject(val) && typeof val.act === "boolean";
}

export function toDetail(val: ShouldAct) {
    return {
        act: isBoolean(val) ? val : val.act,
        detail: !isBoolean(val) && val.detail || "No action"
    };
}

export interface ActionContext {
    logger: MessageLogger;
    dataDir: string;
}

export class Action
    <P extends object = {}, S extends object = {}> extends PrimitiveComponent<P, S> {

    shouldAct(_op: ChangeType, _ctx: ActionContext): ShouldAct | Promise<ShouldAct> {
        throw new Error(`Derived class '${this.constructor.name}' does not ` +
            `implement required method 'shouldAct'`);
    }
    action(_op: ChangeType, _ctx: ActionContext): void | Promise<void> {
        throw new Error(`Derived class '${this.constructor.name}' does not ` +
            `implement required method 'action'`);
    }
}
tagConstructor(Action, "adapt");

export function isActionFinalElement(val: any): val is FinalDomElement {
    return isFinalDomElement(val) &&
        isInstance(val.componentType.prototype, Action, "adapt");
}

export function getActionInstance(el: FinalDomElement): Action | null {
    const inst: any = el.instance;
    if (isInstance(inst, Action, "adapt")) return inst;
    return null;
}
