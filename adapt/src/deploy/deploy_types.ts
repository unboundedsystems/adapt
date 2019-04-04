import {
    Logger,
    MessageLogger,
    TaskObserver,
} from "@usys/utils";
import { isFunction, isObject, isString } from "lodash";
import { Handle } from "../handle";
import {
    AdaptElementOrNull,
    BuiltDomElement,
} from "../jsx";
import { Deployment } from "../server/deployment";

export enum DeployStatus {
    Initial = "Initial",
    Deploying = "Deploying",
    Deployed = "Deployed",
    //Retrying = "Retrying",
    Failed = "Failed",
    //Destroying = "Destroying",
    //Destroyed = "Destroyed",
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
    taskObserver?: TaskObserver;
}

export interface ActionResult {
    action: Action;
    err?: any;
}

export interface WaitInfo {
    description: string;
    status: () => WaitStatus;

    action?: () => Promise<void>;
    dependsOn?: (Handle | WaitInfo)[];
}

export function isWaitInfo(v: any): v is WaitInfo {
    return (
        isObject(v) &&
        isString(v.description) &&
        isFunction(v.status) &&
        (v.action === undefined || isFunction(v.action)) &&
        (v.dependsOn === undefined || Array.isArray(v.dependsOn))
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

export interface PluginManager {
    taskObserver: TaskObserver;
    start(prevDom: AdaptElementOrNull, dom: AdaptElementOrNull,
        options: PluginManagerStartOptions): Promise<void>;
    observe(): Promise<PluginObservations>;
    analyze(): Action[];
    act(dryRun: boolean): Promise<ActionResult[]>;
    finish(): Promise<void>;
}
