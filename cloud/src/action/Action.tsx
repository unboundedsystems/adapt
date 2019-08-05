import {
    BuildData,
    ChangeType,
    FinalDomElement,
    isFinalDomElement,
    PrimitiveComponent,
} from "@adpt/core";
import { isInstance, MessageLogger, tagConstructor } from "@adpt/utils";
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

/**
 * Information that can be used to decide to, or perform actions
 * @public
 */
export interface ActionContext {
    /** Various pieces of data about the current element and build cycle */
    buildData: BuildData;
    /** A location to put files that need to be persisted as state */
    dataDir: string;
    /** Interface to use for logging messages.  Prefer to using stderr or stdout */
    logger: MessageLogger;
}

/**
 * Component that can be inherited to perform actions during deploy
 *
 * @public
 */
export class Action
    <P extends object = {}, S extends object = {}> extends PrimitiveComponent<P, S> {

    /**
     * Calculates whether or not any action is needed based on state/props/observation
     *
     * @returns false if no action needed, `{ act: true, detail: <user-facing description of action> }`.
     */
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
