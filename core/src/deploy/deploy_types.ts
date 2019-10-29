/*
 * Copyright 2019 Unbounded Systems, LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {
    isObject,
    Logger,
    MessageLogger,
    TaskObserver,
} from "@adpt/utils";
import { isFunction, isString } from "lodash";
import { DomDiff } from "../dom_utils";
import { InternalError } from "../error";
import { Handle } from "../handle";
import {
    AdaptElementOrNull,
    AdaptMountedElement,
    FinalDomElement,
} from "../jsx";
import { Deployment } from "../server/deployment";
import { DeployOpID } from "../server/deployment_data";
import { Status } from "../status";

export enum DeployStatus {
    Initial = "Initial",
    Waiting = "Waiting",
    Deploying = "Deploying",
    Destroying = "Destroying",
    //Retrying = "Retrying",

    // Final states
    Deployed = "Deployed",
    Failed = "Failed",
    Destroyed = "Destroyed",
}

export function isDeployStatus(val: any): val is DeployStatus {
    switch (val) {
        case DeployStatus.Initial:
        case DeployStatus.Waiting:
        case DeployStatus.Deploying:
        case DeployStatus.Destroying:
        //case DeployStatus.Retrying:
        case DeployStatus.Deployed:
        case DeployStatus.Failed:
        case DeployStatus.Destroyed:
            return true;
        default:
            return false;
    }
}

export enum InternalStatus {
    ProxyDeploying = "ProxyDeploying",
    ProxyDestroying = "ProxyDestroying",
}

export type DeployStatusExt = DeployStatus | InternalStatus;
// tslint:disable-next-line: variable-name
export const DeployStatusExt = { ...DeployStatus, ...InternalStatus };

export function toDeployStatus(stat: DeployStatusExt): DeployStatus {
    return (
        stat === DeployStatusExt.ProxyDeploying ? DeployStatus.Deploying :
        stat === DeployStatusExt.ProxyDestroying ? DeployStatus.Destroying :
        stat
    );
}

export type FinalStatus =
    DeployStatus.Deployed |
    DeployStatus.Destroyed |
    DeployStatus.Failed;

export function isFinalStatus(ds: DeployStatusExt): ds is FinalStatus {
    switch (ds) {
        case DeployStatus.Deployed:
        case DeployStatus.Destroyed:
        case DeployStatus.Failed:
            return true;
        default:
            return false;
    }
}

/**
 * During a deploy operation for a resource or set of resources, the
 * intended final status for the resource.
 *
 * @remarks
 *
 * - `GoalStatus.Deployed`
 *
 * The operation is attempting to deploy a resource. This includes creation or
 * updating of a resource.
 *
 * - `GoalStatus.Destroyed`
 *
 * The operation is attempting to destroy a resource.
 * @public
 */
export type GoalStatus =
    DeployStatus.Deployed |
    DeployStatus.Destroyed;
// tslint:disable-next-line: variable-name
export const GoalStatus = {
    Deployed: DeployStatus.Deployed as GoalStatus,
    Destroyed: DeployStatus.Destroyed as GoalStatus,
};

export function isGoalStatus(ds: DeployStatusExt): ds is GoalStatus {
    switch (ds) {
        case DeployStatus.Deployed:
        case DeployStatus.Destroyed:
            return true;
        default:
            return false;
    }
}

export function goalToInProgress(stat: GoalStatus) {
    const ret =
        stat === DeployStatus.Deployed ? DeployStatus.Deploying :
        stat === DeployStatus.Destroyed ? DeployStatus.Destroying :
        undefined;
    if (!ret) throw new InternalError(`Bad GoalStatus '${stat}'`);
    return ret;
}

export function isInProgress(stat: DeployStatusExt) {
    return stat === DeployStatusExt.Deploying || stat === DeployStatusExt.Destroying;
}

export function isProxying(stat: DeployStatusExt) {
    return stat === DeployStatusExt.ProxyDeploying ||
        stat === DeployStatusExt.ProxyDestroying;
}

export enum DeployOpStatusExt {
    StateChanged = "StateChanged",
}

export type DeployOpStatus = DeployStatus | DeployOpStatusExt;
// tslint:disable-next-line: variable-name
export const DeployOpStatus = { ...DeployStatus, ...DeployOpStatusExt };

/*
 * Deployment plugins
 */

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
 * Describes the effect an Action has on a specific Element
 * @remarks
 * type and detail here explain how the Action affects this specific
 * element, which may or may not be different than the action. For example,
 * an Action that performs a modify on a CloudFormation stack may cause
 * certain Elements to be created and deleted within that Action.
 * @public
 */
export interface ActionChange {
    type: ChangeType;
    element: FinalDomElement;
    detail: string;
}

/**
 * Describes the overall effect that an Action is performing.
 * @remarks
 * `type` and `detail` here explain what the Action is doing overall, not how it
 * affects any particular Element.
 * @public
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
    log: Logger;  // deprecated
    logger: MessageLogger;
    dataDir: string;
}

export interface PluginObservations {
    [pluginKey: string]: object;
}

export interface Plugin<Observations extends object = object> {
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
    builtElements: AdaptMountedElement[];
    concurrency?: number;
    deployOpID: DeployOpID;
    dryRun?: boolean;
    goalStatus?: GoalStatus;
    processStateUpdates?: () => Promise<{ stateChanged: boolean; }>;
    taskObserver: TaskObserver;
    timeoutMs?: number;
}

export interface ActComplete {
    deployComplete: boolean;
    stateChanged: boolean;
}

/**
 * Relations are used to describe the logic of when an object will be ready.
 *
 * @remarks
 * Relations are primarily used to describe deployment dependencies in Adapt.
 * They can be combined together to express boolean logic, so you can express
 * things like "A is ready when B and C are ready":
 *
 * Relations should usually be created using the supplied library functions.
 * The most commonly used Relation functions are the high-level functions.
 * The high-level Relation functions interact with the Adapt deployment engine
 * for determining whether components have been deployed. These functions are
 * useful in a {@link Component.dependsOn} method for describing what a
 * component depends on.
 *
 * Examples of the more commonly used high-level Relation functions are:
 *   - `Only()` - Creates a `Relation` that is ready when a single dependency
 *     has been deployed.
 *   - `AllOf()` - Creates a `Relation` that's ready when all of a given set
 *     of dependencies have been deployed.
 *   - `AnyOf()` - Creates a `Relation` that's ready when any of a given set
 *     of dependencies have been deployed.
 *
 * Examples of low-level Relation functions are:
 *   - `True()` - Creates a `Relation` that's always ready.
 *   - `False()` - Creates a `Relation` will never be ready.
 *   - `And()` - Creates a `Relation` that becomes ready when all of its
 *      arguments are ready.
 *   - `Edge()` - Creates a `Relation` that checks the deployment status of
 *      an object to determine readiness.
 * @public
 */
export interface Relation {
    description: string;
    ready: (relatesTo: Relation[]) => true | Waiting | Waiting[];

    inverse?: (relatesTo: Relation[]) => Relation;
    relatesTo?: Relation[];
    toString?: (indent?: string) => string;
}

export interface RelationExt extends Relation {
    toDependencies?: () => Dependency[];
}

export function isRelation(v: any): v is Relation {
    return (
        isObject(v) &&
        isString(v.description) &&
        isFunction(v.ready) &&
        (v.inverse === undefined || isFunction(v.inverse)) &&
        (v.relatesTo === undefined || Array.isArray(v.relatesTo)) &&
        (v.toString === undefined || isFunction(v.toString))
    );
}

// A specific kind of Relation that operates on other Relations
export type RelationOp = (...args: Relation[]) => Relation;

export type DependsOn = Relation;
export type DependsOnMethod = (goalStatus: GoalStatus, helpers: DeployHelpers) => DependsOn | undefined;
export type DeployedWhenMethod = (goalStatus: GoalStatus, helpers: DeployHelpers) => WaitStatus | Promise<WaitStatus>;
export type Dependency = Handle | DependsOn;

export const isDependsOn = isRelation;

export interface Waiting {
    done: false;
    status: string;
    related?: Waiting[];
}

export type WaitStatus = true | Waiting | Waiting[];

export type IsDeployedFunc = (dep: Dependency) => boolean;
export interface DeployHelpers {
    elementStatus: <S extends Status = Status>(handle: Handle) => Promise<S | Status | undefined>;
    isDeployed: IsDeployedFunc;
    dependsOn: (dep: Handle | Handle[]) => Relation;
}

export interface PluginManager {
    start(prevDom: AdaptElementOrNull, dom: AdaptElementOrNull,
        options: PluginManagerStartOptions): Promise<void>;
    observe(): Promise<PluginObservations>;
    analyze(): Action[];
    act(options: ActOptions): Promise<ActComplete>;
    finish(): Promise<void>;
}

export interface ExecutionPlanOptions {
    actions: Action[];
    builtElements: AdaptMountedElement[];
    deployment: Deployment;
    deployOpID: DeployOpID;
    diff: DomDiff;
    goalStatus: GoalStatus;
}

export interface ExecutionPlan {
    check(): void;
}

export interface ExecuteOptions {
    concurrency?: number;
    dryRun?: boolean;
    logger: MessageLogger;
    plan: ExecutionPlan;
    pollDelayMs?: number;
    processStateUpdates: () => Promise<{ stateChanged: boolean; }>;
    taskObserver: TaskObserver;
    timeoutMs?: number;
}

export interface ExecuteComplete {
    deploymentStatus: DeployOpStatus;
    nodeStatus: Record<DeployStatus, number>;
    primStatus: Record<DeployStatus, number>;
    nonPrimStatus: Record<DeployStatus, number>;
    stateChanged: boolean;
}
