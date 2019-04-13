import {
    Logger,
    MessageLogger,
    TaskObserver,
} from "@usys/utils";
import { isBoolean, isFunction, isObject, isString } from "lodash";
import { DomDiff } from "../dom_utils";
import { Handle } from "../handle";
import {
    AdaptElementOrNull,
    AdaptMountedElement,
    BuiltDomElement,
} from "../jsx";
import { Deployment } from "../server/deployment";
import { DeploymentSequence } from "../server/deployment_data";
import { Status } from "../status";

export enum DeployStatus {
    Initial = "Initial",
    Waiting = "Waiting",
    Deploying = "Deploying",
    //Destroying = "Destroying",
    //Retrying = "Retrying",

    // Final states
    Deployed = "Deployed",
    Failed = "Failed",
    //Destroyed = "Destroyed",
}

export function isDeployStatus(val: any): val is DeployStatus {
    switch (val) {
        case DeployStatus.Initial:
        case DeployStatus.Waiting:
        case DeployStatus.Deploying:
        //case DeployStatus.Destroying:
        //case DeployStatus.Retrying:
        case DeployStatus.Deployed:
        case DeployStatus.Failed:
        //case DeployStatus.Destroyed:
            return true;
        default:
            return false;
    }
}

export function isFinalStatus(ds: DeployStatus) {
    return ds === DeployStatus.Deployed || ds === DeployStatus.Failed;
}

export type PluginKey = string;
export type PluginInstances = Map<PluginKey, Plugin>;
export type PluginModules = Map<PluginKey, PluginModule>;

export interface PluginRegistration {
    name: string;
    module: NodeModule;
    create(): Plugin;
}

export interface PluginModule extends PluginRegistration {
    packageName: string;
    version: string;
}

export interface PluginConfig {
    plugins: PluginInstances;
    modules: PluginModules;
}

export enum ChangeType {
    none = "none",
    create = "create",
    delete = "delete",
    modify = "modify",
    replace = "replace",
}

/**
 * Describes the effect an Action has on an Element
 * type and detail here explain how the Action affects this specific
 * element, which may or may not be different than the action. For example,
 * an Action that performs a modify on a CloudFormation stack may cause
 * certain Elements to be created and deleted within that Action.
 */
export interface ActionChange {
    type: ChangeType;
    element: BuiltDomElement;
    detail: string;
}

/**
 * Describes the overall effect that an Action is performing.
 * type and detail here explain what the Action is doing overall, not how it
 * affects any particular Element.
 */
export interface ActionInfo {
    type: ChangeType;
    detail: string;
    changes: ActionChange[];
}

export interface Action extends ActionInfo {
    act(): Promise<void>;
}

export interface PluginOptions {
    deployID: string;
    log: Logger;
    dataDir: string;
}

export interface PluginObservations {
    [pluginKey: string]: object;
}

export interface Plugin<Observations extends object = object> {
    seriesActions?: boolean;
    start(options: PluginOptions): Promise<void>;
    observe(prevDom: AdaptElementOrNull, dom: AdaptElementOrNull): Promise<Observations>; //Pull data needed for analyze
    analyze(prevDom: AdaptElementOrNull, dom: AdaptElementOrNull, obs: Observations): Action[];
    finish(): Promise<void>;
}

export interface PluginManagerStartOptions {
    deployment: Deployment;
    logger: MessageLogger;
    dataDir: string;
}

export interface ActOptions {
    concurrency?: number;
    dryRun?: boolean;
    goalStatus?: DeployStatus.Deployed;
    taskObserver: TaskObserver;
    timeoutMs?: number;
    sequence: DeploymentSequence;
}

export interface ActionResult {
    action: Action;
    err?: any;
}

export type Dependency = Handle | DependsOn;

export interface DependsOn {
    description: string;
    status: (this: this, helpers: DeployHelpers) => WaitStatus | Promise<WaitStatus>;

    action?: (this: this, helpers: DeployHelpers) => void | Promise<void>;
    dependsOn?: Dependency[];
}

export function isDependsOn(v: any): v is DependsOn {
    return (
        isObject(v) &&
        isString(v.description) &&
        isFunction(v.status) &&
        (v.action === undefined || isFunction(v.action)) &&
        (v.dependsOn === undefined || Array.isArray(v.dependsOn))
    );
}

export interface WaitInfo extends DependsOn {
    actingFor?: ActionChange[];
    logAction?: boolean;
}

export function isWaitInfo(v: any): v is WaitInfo {
    return (
        isDependsOn(v) &&
        ((v as any).actingFor === undefined || Array.isArray((v as any).actingFor)) &&
        ((v as any).logAction === undefined || isBoolean((v as any).logAction))
    );
}

export interface Waiting {
    done: false;
    status: string;
}

export interface DoneWaiting {
    done: true;
}

export type WaitStatus = Waiting | DoneWaiting;

export interface DeployHelpers {
    elementStatus: <S extends Status = Status>(handle: Handle) => Promise<S | Status | undefined>;
    isDeployed: (dep: Dependency) => boolean;
}

export interface PluginManager {
    start(prevDom: AdaptElementOrNull, dom: AdaptElementOrNull,
        options: PluginManagerStartOptions): Promise<void>;
    observe(): Promise<PluginObservations>;
    analyze(): Action[];
    act(options: ActOptions): Promise<void>;
    finish(): Promise<void>;
}

export interface ExecutionPlanOptions {
    actions: Action[];
    diff: DomDiff;
    goalStatus: DeployStatus.Deployed;
    seriesActions?: Action[][];
}

export interface ExecutionPlan {
    check(): void;
}

export interface ExecuteOptions {
    concurrency?: number;
    deployment: Deployment;
    dryRun?: boolean;
    logger: MessageLogger;
    plan: ExecutionPlan;
    pollDelayMs?: number;
    sequence: DeploymentSequence;
    taskObserver: TaskObserver;
    timeoutMs?: number;
}

export interface ExecutePassOptions extends Required<ExecuteOptions> {
    nodeStatus: StatusTracker;
    timeoutTime: number;
}

export interface ExecuteComplete {
    deploymentStatus: DeployStatus;
    nodeStatus: Record<DeployStatus, number>;
    primStatus: Record<DeployStatus, number>;
}

export interface EPNodeEl {
    element: AdaptMountedElement;
    waitInfo?: WaitInfo;
}
export interface EPNodeWI {
    element?: AdaptMountedElement;
    waitInfo: WaitInfo;
}
export type EPNode = EPNodeEl | EPNodeWI;
export type EPObject = EPNode | AdaptMountedElement | WaitInfo;
export type EPNodeId = string;

export interface StatusTracker {
    readonly deployment: Deployment;
    readonly dryRun: boolean;
    readonly nodeStatus: Record<DeployStatus, number>;
    readonly primStatus: Record<DeployStatus, number>;
    readonly statMap: Map<EPNode, DeployStatusExt>;
    readonly taskMap: Map<EPNode, TaskObserver>;
    readonly sequence: DeploymentSequence;
    get(n: EPNode): DeployStatusExt;
    set(n: EPNode, statExt: DeployStatusExt, err: Error | undefined,
        description?: string): Promise<boolean>;
    isFinal(n: EPNode): boolean;
    isActive(n: EPNode): boolean;
    output(n: EPNode, s: string): void;
    complete(): Promise<ExecuteComplete>;
    debug(getId: (n: EPNode) => string): string;
}

export enum InternalStatus {
    ProxyDeploying = "ProxyDeploying",
}

export type DeployStatusExt = DeployStatus | InternalStatus;
// tslint:disable-next-line: variable-name
export const DeployStatusExt = { ...DeployStatus, ...InternalStatus };

export function isFinalStatusExt(stat: DeployStatusExt) {
    return isDeployStatus(stat) && isFinalStatus(stat);
}

export function toDeployStatus(stat: DeployStatusExt): DeployStatus {
    return stat === DeployStatusExt.ProxyDeploying ? DeployStatus.Deploying : stat;
}
