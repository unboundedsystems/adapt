import {
    TaskObserver,
} from "@usys/utils";
import { isFunction, isObject, isString } from "lodash";
import {
    AdaptMountedElement,
} from "../jsx";
import { Deployment } from "../server/deployment";
import { DeployOpID, DeployStepID } from "../server/deployment_data";
import {
    ActionChange,
    DeployedWhenMethod,
    DeployStatus,
    DeployStatusExt,
    ExecuteComplete,
    ExecuteOptions,
    GoalStatus,
    isDependsOn,
    RelationExt,
} from "./deploy_types";

export interface ExecutePassOptions extends Required<ExecuteOptions> {
    nodeStatus: StatusTracker;
    timeoutTime: number;
}

export interface WaitInfo {
    deployedWhen: (gs: GoalStatus) => ReturnType<DeployedWhenMethod>;
    description: string;

    actingFor?: ActionChange[];
    action?: () => void | Promise<void>;
    dependsOn?: RelationExt;
    logAction?: boolean;
}

export function isWaitInfo(v: any): v is WaitInfo {
    return (
        isObject(v) &&
        isFunction(v.deployedWhen) &&
        isString(v.description) &&
        (v.actingFor === undefined || Array.isArray(v.actingFor)) &&
        (v.action === undefined || isFunction(v.action)) &&
        (v.dependsOn === undefined || isDependsOn(v.dependsOn))
    );
}

export interface EPNodeCommon {
    goalStatus: GoalStatus;
    hardDeps?: Set<EPNode>;
}
export interface EPNodeEl extends EPNodeCommon {
    element: AdaptMountedElement;
    waitInfo?: WaitInfo;
}
export interface EPNodeWI extends EPNodeCommon {
    element?: AdaptMountedElement;
    waitInfo: WaitInfo;
}

export function isEPNodeWI(n: EPNode): n is EPNodeWI {
    return isWaitInfo(n.waitInfo);
}

export type EPNode = EPNodeEl | EPNodeWI;
export type EPObject = EPNode | AdaptMountedElement | WaitInfo;
export type EPNodeId = string;

export interface EPEdge {
    hard?: boolean;
}

export interface StatusTracker {
    readonly deployment: Deployment;
    readonly dryRun: boolean;
    readonly goalStatus: GoalStatus;
    readonly nodeStatus: Record<DeployStatus, number>;
    readonly deployOpID: DeployOpID;
    readonly primStatus: Record<DeployStatus, number>;
    readonly statMap: Map<EPNode, DeployStatusExt>;
    readonly taskMap: Map<EPNode, TaskObserver>;
    readonly stepID?: DeployStepID;
    get(n: EPNode): DeployStatusExt;
    set(n: EPNode, statExt: DeployStatusExt, err: Error | undefined,
        description?: string): Promise<boolean>;
    isFinal(n: EPNode): boolean;
    isActive(n: EPNode): boolean;
    output(n: EPNode, s: string): void;
    complete(stateChanged: boolean): Promise<ExecuteComplete>;
    debug(getId: (n: EPNode) => string): string;
}
