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

import { ensureError, formatUserError, notNull, sleep, toArray, UserError } from "@adpt/utils";
import AsyncLock from "async-lock";
import db from "debug";
import { alg, Graph } from "graphlib";
import { isError, isObject } from "lodash";
import PQueue from "p-queue";
import pTimeout from "p-timeout";
import { inspect } from "util";
import { makeElementStatus } from "../dom";
import { ElementNotInDom, InternalError } from "../error";
import { Handle, isHandle } from "../handle";
import {
    AdaptElement,
    AdaptMountedElement,
    // @ts-ignore - here to deal with issue #71
    AnyProps,
    ElementID,
    isMountedElement,
} from "../jsx";
import { Deployment } from "../server/deployment";
import { DeployOpID } from "../server/deployment_data";
import { Status } from "../status";
import {
    Action,
    ChangeType,
    Dependency,
    DependsOn,
    DeployHelpers,
    DeployOpStatus,
    DeployStatus,
    DeployStatusExt,
    ExecuteComplete,
    ExecuteOptions,
    ExecutionPlan,
    ExecutionPlanOptions,
    GoalStatus,
    goalToInProgress,
    isDependsOn,
    isFinalStatus,
    isInProgress,
    Relation,
} from "./deploy_types";
import {
    EPEdge,
    EPNode,
    // @ts-ignore - here to deal with issue #71
    EPNodeEl,
    EPNodeId,
    EPNodeWI,
    EPObject,
    ExecutePassOptions,
    isEPNodeWI,
    isWaitInfo,
    StatusTracker,
    WaitInfo,
} from "./deploy_types_private";
import { DeployedWhenQueue } from "./deployed_when_queue";
import {
    relatedHandles,
    relationInverse,
    relationIsReady,
    relationIsReadyStatus,
    relationToString,
    waitStatusToString,
} from "./relation_utils";
import { And, Edge } from "./relations";
import { createStatusTracker } from "./status_tracker";

const debugExecute = db("adapt:deploy:execute");
const debugExecuteDetail = db("adapt:detail:deploy:execute");

export async function createExecutionPlan(options: ExecutionPlanOptions): Promise<ExecutionPlan> {
    const { actions, builtElements, diff } = options;

    const plan = new ExecutionPlanImpl(options);

    diff.added.forEach((e) => plan.addElem(e, DeployStatus.Deployed));
    diff.commonNew.forEach((e) => plan.addElem(e, DeployStatus.Deployed));
    diff.deleted.forEach((e) => plan.addElem(e, DeployStatus.Destroyed));
    builtElements.forEach((e) => plan.addElem(e, DeployStatus.Deployed));
    actions.forEach((a) => plan.addAction(a));
    plan.updateElemWaitInfo();

    return plan;
}

export function getWaitInfo(goalStatus: GoalStatus,
    e: AdaptElement | Handle, helpers: DeployHelpers): WaitInfo | undefined {

    const hand = isHandle(e) ? e : e.props.handle;
    const elem = hand.mountedOrig;
    if (elem === undefined) throw new InternalError("element has no mountedOrig!");
    if (elem === null) throw new ElementNotInDom();

    const dependsOn = elem.dependsOn(goalStatus, helpers);
    const compDeployedWhen = elem.instance.deployedWhen;
    if (dependsOn == null && compDeployedWhen == null) return undefined;

    if (dependsOn && !isDependsOn(dependsOn)) {
        throw new UserError(`Component '${elem.componentName}' dependsOn ` +
            `method returned a value that is not a DependsOn object. ` +
            `[Element id: ${elem.id}] returned: ${inspect(dependsOn)}`);
    }
    const wi: WaitInfo = {
        description: dependsOn ? dependsOn.description : elem.componentName,
        deployedWhen: compDeployedWhen ?
            (gs: GoalStatus) => compDeployedWhen(gs, helpers) : (() => true),
    };
    if (dependsOn) wi.dependsOn = dependsOn;
    return wi;
}

export interface EPDependency {
    id: EPNodeId;
    type: "soft" | "hard";
}
export interface EPDependencies {
    [epNodeId: string]: {
        elementId?: ElementID;
        detail: string;
        deps: EPDependency[];
    };
}

export interface ExecutionPlanImplOptions {
    deployment: Deployment;
    deployOpID: DeployOpID;
    goalStatus: GoalStatus;
}

export class ExecutionPlanImpl implements ExecutionPlan {
    readonly deployment: Deployment;
    readonly deployOpID: DeployOpID;
    readonly goalStatus: GoalStatus;
    readonly helpers: DeployHelpersFactory;
    protected graph = new Graph({ compound: true });
    protected nextWaitId = 0;
    protected waitInfoIds = new WeakMap<WaitInfo, string>();
    protected complete = new Map<EPNodeId, EPNode>();

    constructor(options: ExecutionPlanImplOptions) {
        this.goalStatus = options.goalStatus;
        this.deployment = options.deployment;
        this.deployOpID = options.deployOpID;
        this.helpers = new DeployHelpersFactory(this, this.deployment);
    }

    /*
     * Public interfaces
     */
    check() {
        const cycleGroups = alg.findCycles(this.graph);
        if (cycleGroups.length > 0) {
            const cycles = cycleGroups.map(printCycleGroups).join("\n");
            if (debugExecute.enabled) {
                debugExecute(`Execution plan dependencies:\n${this.print()}`);
            }
            throw new UserError(`There are circular dependencies present in this deployment:\n${cycles}`);
        }
    }

    /*
     * Semi-private interfaces (for use by this file)
     */
    addElem(element: AdaptMountedElement, goalStatus: GoalStatus) {
        const node: EPNode = { element, goalStatus };
        this.addNode(node);
        return node;
    }

    addAction(action: Action) {
        if (action.type === ChangeType.none) return undefined;

        const node: EPNode = {
            goalStatus: changeTypeToGoalStatus(action.type),
            waitInfo: {
                description: action.detail,
                action: action.act,
                actingFor: action.changes,
                deployedWhen: () => true,
                logAction: true,
            }
        };
        this.addNode(node);

        action.changes.forEach((c) => {
            if (c.type === ChangeType.none) return;

            this.addElem(c.element, changeTypeToGoalStatus(c.type));
            const leader = this.groupLeader(c.element);
            if (leader === node) return;
            if (leader) {
                throw new Error(
                    `More than one Action referenced Element '${c.element.id}'. ` +
                    `An Element may only be affected by one Action`);
            }
            this.setGroup(c.element, node);
        });
        return node;
    }

    addWaitInfo(nodeOrWI: WaitInfo | EPNodeWI, goalStatus: GoalStatus) {
        let node: EPNodeWI;
        let waitInfo: WaitInfo;
        if (isWaitInfo(nodeOrWI)) {
            node = { goalStatus, waitInfo: nodeOrWI };
            waitInfo = nodeOrWI;
            this.addNode(node);
        } else {
            node = nodeOrWI;
            waitInfo = node.waitInfo;
        }

        if (waitInfo.dependsOn) {
            const hands = relatedHandles(waitInfo.dependsOn);
            hands.forEach((h) => {
                if (!h.associated) {
                    // TODO: Add info about the handle, like traceback for
                    // where it was created.
                    throw new UserError(
                        `A Component dependsOn method returned a DependsOn ` +
                        `object '${waitInfo.description}' that contains ` +
                        `a Handle that is not associated with any Element`);
                }
                if (h.mountedOrig) {
                    // If mountedOrig has already been added, its goal
                    // status won't change.
                    this.addElem(h.mountedOrig, goalStatus);
                    this.addEdge(node, h.mountedOrig);
                }
            });
        }
        return node;
    }

    updateElemWaitInfo() {
        this.nodes.forEach((n) => {
            const el = n.element;
            if (el == null) return;
            if (n.waitInfo != null) throw new InternalError(`Expected EPNode.waitInfo to be null`);
            const helpers = this.helpers.create(el);
            n.waitInfo = getWaitInfo(n.goalStatus, el, helpers);
            if (!isEPNodeWI(n)) return;

            this.addWaitInfo(n, n.goalStatus);
        });
    }

    addNode(node: EPNode) {
        if (this.hasNode(node)) return;
        this.graph.setNode(this.getId(node, true), node);
    }

    addHardDep(obj: EPObject, dependsOn: EPObject) {
        this.addEdge(obj, dependsOn, true);
    }

    removeNode(node: EPNode) {
        const id = this.getId(node);
        const preds = this.predecessors(node);
        preds.forEach((p) => this.removeHardDepInternal(p, node));
        this.graph.removeNode(id);
        this.complete.set(id, node);
    }

    predecessors(n: EPNode): EPNode[] {
        const preds = this.graph.predecessors(this.getId(n));
        if (preds == null) throw new InternalError(`Requested node that's not in graph id=${this.getId(n)}`);
        return preds.map(this.getNode);
    }

    successors(n: EPNode): EPNode[] {
        const succs = this.graph.successors(this.getId(n));
        if (succs == null) throw new InternalError(`Requested node that's not in graph id=${this.getId(n)}`);
        return succs.map(this.getNode);
    }

    groupLeader(n: EPObject): EPNode | undefined {
        const leader = this.graph.parent(this.getId(n));
        return leader ? this.getNode(leader) : undefined;
    }

    groupFollowers(n: EPObject): EPNode[] {
        const fols = this.graph.children(this.getId(n)) || [];
        return fols.map(this.getNode);
    }

    setGroup(n: EPObject, leader: EPObject) {
        const nId = this.getId(n);
        n = this.getNode(n);
        const oldLeader = this.groupLeader(n);
        if (oldLeader) throw new InternalError(`Node '${nId}' already in group '${this.getId(oldLeader)}'`);

        // When n becomes part of a group, the group leader adopts the
        // dependencies of all the other members of the group. For example,
        // starting with deps:
        //   el1 -> el2
        // Now call setGroup(el1, lead) and the result should be:
        //   el1 -> lead -> el2
        this.successors(n).forEach((succ) => {
            const e = this.getEdgeInternal(n, succ);
            if (!e) {
                throw new InternalError(`Internal consistency check failed. ` +
                    `node has a successor, but no edge`);
            }
            this.removeEdgeInternal(n, succ);
            this.addEdgeInternal(leader, succ, e.hard === true);
        });

        this.addEdgeInternal(n, leader, true);
        this.graph.setParent(nId, this.getId(leader));
    }

    get nodes(): EPNode[] {
        return this.graph.nodes().map(this.getNode);
    }

    get elems(): AdaptMountedElement[] {
        return this.nodes
            .map((n) => n.element)
            .filter(notNull);
    }

    get leaves(): EPNode[] {
        return this.graph.sinks().map(this.getNode);
    }

    getId = (obj: EPObject, create = false): EPNodeId => {
        const id = this.getIdInternal(obj, create);
        if (!id) throw new Error(`ID not found (${idOrObjInfo(obj)})`);
        return id;
    }

    getNode = (idOrObj: EPNodeId | EPObject): EPNode => {
        const node = this.getNodeInternal(idOrObj);
        if (!node) throw new Error(`Node not found (${idOrObjInfo(idOrObj)})`);
        return node;
    }

    hasNode = (idOrObj: EPNodeId | EPObject): boolean => {
        return this.getNodeInternal(idOrObj) != null;
    }

    toDependencies(): EPDependencies {
        const detail = (n: EPNode) => {
            const w = n.waitInfo;
            if (w) return w.description;
            else if (n.element) return n.element.id;
            return "unknown";
        };
        const getDeps = (node: EPNode, id: EPNodeId) => {
            const hardDeps = node.hardDeps ?
                [...node.hardDeps].map((n) => this.getId(n)) : [];
            const hardSet = new Set(hardDeps);

            const succIds = this.graph.successors(id);
            if (!succIds) throw new InternalError(`id '${id}' not found`);
            const deps = succIds.map<EPDependency>((sId) => {
                const isHard = hardSet.delete(sId);
                return { id: sId, type: isHard ? "hard" : "soft" };
            });
            if (hardSet.size !== 0) {
                throw new InternalError(`Internal consistency check failed: ` +
                    `not all hardDeps are successors`);
            }
            const entry: EPDependencies[string] = { detail: detail(node), deps };
            if (node.element) entry.elementId = node.element.id;
            return entry;
        };

        const ret: EPDependencies = {};
        const ids = alg.isAcyclic(this.graph) ?
            alg.topsort(this.graph) : this.graph.nodes();

        // Insert starting with leaves for a more human-readable ordering
        for (let i = ids.length - 1; i >= 0; i--) {
            const id = ids[i];
            const node = this.getNode(id);
            ret[id] = getDeps(node, id);
        }
        return ret;
    }

    print() {
        const epDeps = this.toDependencies();
        const depIDs = Object.keys(epDeps);
        if (depIDs.length === 0) return "<empty>";

        const succs = (id: string) => {
            const list = epDeps[id] && epDeps[id].deps;
            if (!list || list.length === 0) return "    <none>";
            return list.map((s) => `    ${name(s.id)} [${s.type[0]}]`).join("\n");
        };
        const name = (id: string) => {
            const w = this.getNode(id).waitInfo;
            if (w) id += ` (${w.description})`;
            return id;
        };
        const printDeps = (ids: string[]) =>
            ids
            .map((id) => `  ${name(id)}\n${succs(id)}`);

        const byGoal: { [ goal: string ]: string[] | undefined } = {};
        const insert = (id: string, goal: string) => {
            const l = byGoal[goal] || [];
            l.push(id);
            byGoal[goal] = l;
        };

        for (const id of depIDs) {
            insert(id, this.getNode(id).goalStatus);
        }

        const lines: string[] = [];
        for (const goal of Object.keys(byGoal).sort()) {
            let gName = goal;
            try {
                gName = goalToInProgress(goal as any);
            } catch (e) { /* */ }
            lines.push(`${gName}:`, ...printDeps(byGoal[goal]!));
        }

        return lines.join("\n");
    }

    /*
     * Class-internal methods
     */
    protected getIdInternal = (obj: EPObject, create = false): EPNodeId | undefined => {
        const elId = (e: AdaptMountedElement) => "E:" + e.id;
        const wiId = (w: WaitInfo) => {
            let id = this.waitInfoIds.get(w);
            if (!id) {
                if (!create) return undefined;
                id = "W:" + this.nextWaitId++;
                this.waitInfoIds.set(w, id);
            }
            return id;
        };

        if (isMountedElement(obj)) return elId(obj);
        if (isWaitInfo(obj)) return wiId(obj);
        if (isMountedElement(obj.element)) return elId(obj.element);
        if (isWaitInfo(obj.waitInfo)) return wiId(obj.waitInfo);
        throw new InternalError(`Invalid object in getId (${obj})`);
    }

    protected getNodeInternal = (idOrObj: EPNodeId | EPObject): EPNode | undefined => {
        const id =
            typeof idOrObj === "string" ? idOrObj :
            this.getIdInternal(idOrObj);
        if (!id) return undefined;
        return this.graph.node(id) || this.complete.get(id);
    }

    protected getEdgeInternal =
        (idOrObj1: EPNodeId | EPObject, idOrObj2: EPNodeId | EPObject): EPEdge | undefined => {
        const n1 = this.getNodeInternal(idOrObj1);
        const n2 = this.getNodeInternal(idOrObj2);
        if (!n1 || !n2) return undefined;

        const id1 = this.getIdInternal(n1);
        const id2 = this.getIdInternal(n2);
        if (!id1 || !id2) return undefined;

        if (!this.graph.hasEdge(id1, id2)) return undefined;

        // TODO: Should probably just store this info on the edge itself
        if (n1.hardDeps && n1.hardDeps.has(n2)) return { hard: true };
        return {};
    }

    /**
     * The direction of the dependency has to be reversed for Destroy
     * so that things are destroyed in "reverse order" (actually by
     * walking the graph in the opposite order). But a single graph
     * contains some things that are being Deployed and some that are
     * being Destroyed.
     * The arguments to the function (obj, dependsOn) identify two EPNodes.
     * Each of those two EPNodes could have goalStatus Deployed or Destroyed,
     * so there are 4 possible combinations:
     *   A) Deployed, Deployed
     *      This is the simple case where `dependsOn` should be Deployed
     *      before `obj` is Deployed. The edge is `obj` -> `dependsOn`.
     *   B) Destroyed, Destroyed
     *      Also simple. If `dependsOn` must be Deployed before `obj`, then
     *      it's reversed for Destroyed and `obj` must be Destroyed before
     *      `dependsOn`. The edge is `dependsOn` -> `obj`.
     *   C) Destroyed, Deployed
     *      The valid way this can happen when used with an actual old DOM
     *      and new DOM is that `obj` is from the old DOM. The new DOM does
     *      not contain this node and therefore *cannot* have a dependency
     *      on it. The dependency here can be ignored safely. No edge.
     *   D) Deployed, Destroyed
     *      This doesn't make sense right now because there's not really a
     *      way for a "living" component in the new DOM to get a reference
     *      to something being deleted from the old DOM. This is currently
     *      an error.
     */
    protected addEdge(obj: EPObject, dependsOn: EPObject, hardDep = false) {
        obj = this.getNode(obj);
        dependsOn = this.getNode(dependsOn);
        let a: EPNode;
        let b: EPNode;
        const goals = `${obj.goalStatus},${dependsOn.goalStatus}`;
        switch (goals) {
            case "Deployed,Deployed":   a = obj; b = dependsOn; break;
            case "Destroyed,Destroyed": a = dependsOn; b = obj; break;
            case "Destroyed,Deployed":  return; // Intentionally no edge
            case "Deployed,Destroyed":
            default:
                throw new InternalError(`Unable to create dependency for ` +
                    `invalid goal pair '${goals}'`);
        }
        // If a is in a group, all outbound dependencies are attached to
        // the group leader (and "a" will already have a dependency on the
        // group leader from when it joined the group).
        const leader = this.groupLeader(a);

        // If there's a leader, re-make the check for dissimilar goalStatus
        // but with the leader.
        if (leader && leader.goalStatus !== b.goalStatus) {
            if (leader.goalStatus === GoalStatus.Destroyed) {
                throw new InternalError(`Unable to create dependency for ` +
                    `leader being Destroyed on dependency being Deployed`);
            }
            return; // Intentionally no edge
        }
        this.addEdgeInternal(leader || a, b, hardDep);
    }

    protected addEdgeInternal(obj: EPObject, dependsOn: EPObject, hardDep: boolean) {
        const objId = this.getId(obj);
        this.graph.setEdge(objId, this.getId(dependsOn));
        if (hardDep) this.addHardDepInternal(this.getNode(objId), this.getNode(dependsOn));
    }

    protected removeEdgeInternal(obj: EPObject, dependsOn: EPObject) {
        const objId = this.getId(obj);
        this.graph.removeEdge(objId, this.getId(dependsOn));
        this.removeHardDepInternal(this.getNode(objId), this.getNode(dependsOn));
    }

    protected addHardDepInternal(obj: EPNode, dependsOn: EPNode) {
        if (obj.hardDeps == null) obj.hardDeps = new Set();
        obj.hardDeps.add(dependsOn);
    }

    protected removeHardDepInternal(obj: EPNode, dependsOn: EPNode) {
        if (obj.hardDeps != null) obj.hardDeps.delete(dependsOn);
    }
}

export function isExecutionPlanImpl(val: any): val is ExecutionPlanImpl {
    return isObject(val) && val instanceof ExecutionPlanImpl;
}

function debugExecId(id: string, ...args: any[]) {
    debugExecute(`* ${(id as any).padEnd(26)}`, ...args);
}
function debugExecDetailId(id: string, ...args: any[]) {
    debugExecuteDetail(`* ${(id as any).padEnd(26)}`, ...args);
}

const defaultExecuteOptions = {
    concurrency: Infinity,
    dryRun: false,
    pollDelayMs: 1000,
    timeoutMs: 0,
};

export async function execute(options: ExecuteOptions): Promise<ExecuteComplete> {
    const opts = { ...defaultExecuteOptions, ...options };
    const plan = opts.plan;
    const timeoutTime = opts.timeoutMs ? Date.now() + opts.timeoutMs : 0;

    if (!isExecutionPlanImpl(plan)) throw new InternalError(`plan is not an ExecutionPlanImpl`);

    const deployOpID = plan.deployOpID;
    const nodeStatus = await createStatusTracker({
        deployment: plan.deployment,
        deployOpID,
        dryRun: opts.dryRun,
        goalStatus: plan.goalStatus,
        nodes: plan.nodes,
        taskObserver: opts.taskObserver,
    });
    plan.helpers.nodeStatus = nodeStatus;

    //TODO: Remove?
    debugExecute(`\nExecution plan:\n${plan.print()}`);

    try {
        while (true) {
            const stepNum = nodeStatus.stepID ? nodeStatus.stepID.deployStepNum : "DR";
            const stepStr = `${deployOpID}.${stepNum}`;
            debugExecute(`\n\n-----------------------------\n\n` +
                `**** Starting execution step ${stepStr}`);

            await executePass({ ...opts, nodeStatus, timeoutTime });
            const { stateChanged } = await opts.processStateUpdates();
            const ret = await nodeStatus.complete(stateChanged);

            debugExecute(`**** execution step ${stepStr} status: ${ret.deploymentStatus}\nSummary:`,
                inspect(ret), "\n", nodeStatus.debug(plan.getId), "\n-----------------------------\n\n");

            // Keep polling until we're done or the state changes, which means
            // we should do a re-build.
            if (ret.deploymentStatus === DeployOpStatus.StateChanged ||
                isFinalStatus(ret.deploymentStatus)) {
                debugExecute(`**** Execution completed`);
                return ret;
            }
            await sleep(opts.pollDelayMs);
        }

    } catch (err) {
        err = ensureError(err);
        opts.logger.error(`Deploy operation failed: ${err.message}`);
        let stateChanged = false;

        try {
            const upd = await opts.processStateUpdates();
            if (upd.stateChanged) stateChanged = true;
        } catch (err2) {
            err2 = ensureError(err2);
            opts.logger.error(`Error processing state updates during error handling: ${err2.message}`);
        }

        debugExecute(`**** Execution failed:`, inspect(err));
        if (err.name === "TimeoutError") {
            //TODO : Mark all un-deployed as timed out
            for (const n of plan.nodes) {
                await nodeStatus.set(n, DeployStatus.Failed, err);
            }
            return nodeStatus.complete(stateChanged);

        } else {
            throw err;
        }
    }
}

export async function executePass(opts: ExecutePassOptions) {
    const { dryRun, logger, nodeStatus, plan } = opts;

    if (!isExecutionPlanImpl(plan)) throw new InternalError(`plan is not an ExecutionPlanImpl`);

    const locks = new AsyncLock();
    const queue = new PQueue({ concurrency: opts.concurrency });
    let stopExecuting = false;
    const dwQueue = new DeployedWhenQueue(debugExecDetailId);

    // If an action is on behalf of some Elements, those nodes take on
    // the status of the action in certain cases.
    const signalActingFor = async (node: EPNode, stat: DeployStatusExt, err: Error | undefined) => {
        const w = node.waitInfo;
        if (!w || !w.actingFor || !shouldNotifyActingFor(stat)) return;
        await Promise.all(w.actingFor.map(async (c) => {
            const n = plan.getNode(c.element);
            if (!nodeStatus.isActive(n)) return;
            const s =
                err ? err :
                stat === DeployStatusExt.Deploying ? DeployStatusExt.ProxyDeploying :
                stat === DeployStatusExt.Destroying ? DeployStatusExt.ProxyDestroying :
                stat;
            await updateStatus(n, s, c.detail);
        }));
    };

    const signalPreds = async (n: EPNode, stat: DeployStatusExt) => {
        if (!isFinalStatus(stat)) return;
        plan.predecessors(n).forEach(queueRun);
    };

    const queueRun = (n: EPNode) => queue.add(() => run(n));

    const run = async (n: EPNode) => {
        const id = plan.getId(n);
        await locks.acquire(id, () => runLocked(n, id));
    };

    const runLocked = async (n: EPNode, id: EPNodeId) => {
        let errorLogged = false;
        try {
            if (stopExecuting) return debugExecId(id, `TIMED OUT: Can't start task`);

            const stat = nodeStatus.get(n);
            if (isFinalStatus(stat)) return debugExecId(id, `Already complete`);
            if (!(isWaiting(stat) || isInProgress(stat))) {
                throw new InternalError(`Unexpected node status ${stat}: ${id}`);
            }

            if (!dependenciesMet(n, id)) return;
            debugExecId(id, `  Dependencies met`);

            const w = n.waitInfo;
            if (w) {
                if (!isInProgress(stat)) {
                    await updateStatus(n, goalToInProgress(n.goalStatus)); // now in progress

                    if (w.action) {
                        debugExecId(id, `ACTION: Doing ${w.description}`);
                        if (w.logAction) logger.info(`Doing ${w.description}`);
                        try {
                            if (!dryRun) await w.action();
                        } catch (err) {
                            logger.error(`--Error while ${w.description}\n${err}\n----------`);
                            errorLogged = true;
                            throw err;
                        }
                    }
                }
                const wStat = await w.deployedWhen(n.goalStatus);
                if (wStat !== true) {
                    const statStr = waitStatusToString(wStat);
                    debugExecId(id, `NOT COMPLETE: ${w.description}: ${statStr}`);
                    nodeStatus.output(n, statStr);
                    dwQueue.enqueue(n, id, wStat);
                    return;
                }
                debugExecId(id, `COMPLETE: ${w.description}`);

            } else {
                debugExecId(id, `  No wait info`);
                // Go through normal state transition to
                // trigger correct downstream events to TaskObservers.
                await updateStatus(n, goalToInProgress(n.goalStatus));
            }
            await updateStatus(n, n.goalStatus);
            plan.removeNode(n);

        } catch (err) {
            err = ensureError(err);
            debugExecId(id, `FAILED: ${err}`);
            await updateStatus(n, err);
            if (!errorLogged) {
                logger.error(`Error while ${goalToInProgress(n.goalStatus).toLowerCase()} ` +
                    `${nodeDescription(n)}: ${formatUserError(err)}`);
            }
            if (err.name === "InternalError") throw err;
        } finally {
            if (n.element) dwQueue.completed(n.element, queueRun);
        }
    };

    const updateStatus = async (n: EPNode, stat: DeployStatusExt | Error,
        description?: string): Promise<boolean> => {
        if (stopExecuting) return false;

        const { err, deployStatus } = isError(stat) ?
            { err: stat, deployStatus: DeployStatus.Failed } :
            { err: undefined, deployStatus: stat };

        debugExecId(plan.getId(n), `STATUS: ${deployStatus}${err ? ": " + err : ""}`);
        const changed = await nodeStatus.set(n, deployStatus, err, description);
        if (changed) {
            await signalActingFor(n, deployStatus, err);
            await signalPreds(n, deployStatus);
        }
        return changed;
    };

    const mkIdStr = (ids: EPNodeId[]) => ids.join(" > ");

    const softDepsReady = (n: EPNode, ids: EPNodeId[]) => {
        // If this node is being Deployed, just look at its own WaitInfo
        if (n.goalStatus === DeployStatus.Deployed) {
            return waitIsReady(n, false, ids);
        }

        // But if the node is being Destroyed, we instead evaluate all of our
        // successors' WaitInfos, each in the inverse direction.
        const succs = plan.successors(n);
        debugExecDetailId(mkIdStr(ids), `  Evaluating: ${succs.length} successors`);
        for (const s of succs) {
            // TODO: There probably needs to be a check here comparing
            // goalStatus for s and n, similar to addEdge.
            const sId = plan.getId(s);
            if (!waitIsReady(s, true, [...ids, sId])) return false;
        }
        return true;
    };

    const waitIsReady = (n: EPNode, invert: boolean, ids: EPNodeId[]) => {
        const w = n.waitInfo;
        let dep = w && w.dependsOn;
        if (invert && dep) dep = relationInverse(dep);

        if (debugExecute.enabled) {
            const idStr = mkIdStr(ids);
            const desc = !w ? "no soft dep" :
                dep ? `soft dep (${w.description}) - Relation${invert ? " (inverted)" : ""}: ${relationToString(dep)}` :
                `no soft dep (${w.description})`;
            debugExecDetailId(idStr, `  Evaluating: ${desc}`);
            if (!dep) return true;
            const relStatus = relationIsReadyStatus(dep);
            debugExecId(idStr, `  Relation status:`, relStatus === true ? "READY" : relStatus);
            return relStatus === true;
        }
        return dep ? relationIsReady(dep) : true;
    };

    const dependenciesMet = (n: EPNode, id: EPNodeId): boolean => {
        const hardDeps = n.hardDeps || new Set();
        debugExecDetailId(id, `  Evaluating: ${hardDeps.size} hard deps`);
        for (const d of hardDeps) {
            if (!nodeIsDeployed(d, id, nodeStatus)) {
                debugExecId(id, `NOTYET: hard deps`);
                return false;
            }
        }

        if (!softDepsReady(n, [id])) {
            debugExecId(id, `NOTYET: soft dep`);
            return false;
        }

        const followers = plan.groupFollowers(n);
        debugExecDetailId(id, `  Evaluating: ${followers.length} followers`);
        for (const f of followers) {
            const fStat = nodeStatus.get(f);
            const fId = plan.getId(f);
            if (!isWaiting(fStat)) {
                throw new InternalError(`Invalid status ${fStat} for follower ${fId}`);
            }
            if (!softDepsReady(f, [id, fId])) {
                debugExecId(id, `NOTYET: followers`);
                return false;
            }
        }

        return true;
    };

    /*
     * Main execute code path
     */
    try {
        // Queue the leaf nodes that have no dependencies
        plan.leaves.forEach(queueRun);

        // Then wait for all promises to resolve
        let pIdle = queue.onIdle();
        if (opts.timeoutMs && opts.timeoutTime) {
            const msg = `Deploy operation timed out after ${opts.timeoutMs / 1000} seconds`;
            const timeLeft = opts.timeoutTime - Date.now();
            if (timeLeft <= 0) throw new pTimeout.TimeoutError(msg);

            pIdle = pTimeout(pIdle, timeLeft, msg);
        }
        await pIdle;

    } catch (err) {
        stopExecuting = true;
        throw err;
    }
}

function shouldNotifyActingFor(status: DeployStatusExt) {
    switch (status) {
        case DeployStatus.Deploying:
        case DeployStatus.Destroying:
        //case DeployStatus.Retrying:
        case DeployStatus.Failed:
            return true;
        default:
            return false;
    }
}

function isWaiting(stat: DeployStatusExt) {
    return (
        stat === DeployStatusExt.Waiting ||
        stat === DeployStatusExt.ProxyDeploying ||
        stat === DeployStatusExt.ProxyDestroying
    );
}

function changeTypeToGoalStatus(ct: ChangeType): GoalStatus {
    switch (ct) {
        case ChangeType.none:
        case ChangeType.create:
        case ChangeType.modify:
        case ChangeType.replace:
            return DeployStatus.Deployed;
        case ChangeType.delete:
            return DeployStatus.Destroyed;
        default:
            throw new InternalError(`Bad ChangeType '${ct}'`);
    }
}

function printCycleGroups(group: string[]) {
    if (group.length < 1) throw new InternalError(`Cycle group with no members`);
    const c = [...group, group[0]];
    return "  " + c.join(" -> ");
}

function toElemOrWaitInfo(val: Handle | AdaptMountedElement | DependsOn): AdaptMountedElement | WaitInfo {
    if (isMountedElement(val) || isWaitInfo(val)) return val;
    if (!isHandle(val)) {
        throw new Error(`Attempt to convert an invalid object to Element or WaitInfo: ${inspect(val)}`);
    }
    const elem = val.mountedOrig;
    if (elem === undefined) throw new InternalError("element has no mountedOrig!");
    if (elem === null) throw new ElementNotInDom();
    return elem;
}

function nodeIsDeployed(n: EPNode, id: EPNodeId, tracker: StatusTracker): boolean {
    const sStat = tracker.get(n);
    if (sStat === n.goalStatus) return true; // Dependency met
    if (sStat === DeployStatusExt.Failed) {
        throw new UserError(`A dependency failed to deploy successfully`);
    }
    if (isWaiting(sStat) || isInProgress(sStat)) return false;
    throw new InternalError(`Invalid status ${sStat} for ${id}`);
}

function nodeDescription(n: EPNode): string {
    if (n.waitInfo) return n.waitInfo.description;
    if (n.element) return `${n.element.componentName} (id=${n.element.id})`;
    return "Unknown node";
}

function idOrObjInfo(idOrObj: EPNodeId | EPObject) {
    return typeof idOrObj === "string" ? idOrObj :
        isWaitInfo(idOrObj) ? idOrObj.description :
        isMountedElement(idOrObj) ? idOrObj.id :
        idOrObj.element ? idOrObj.element.id :
        idOrObj.waitInfo ? idOrObj.waitInfo.description :
        "unknown";
}

class DeployHelpersFactory {
    elementStatus: <S extends Status = Status>(handle: Handle) => Promise<S | Status | undefined>;
    protected nodeStatus_: StatusTracker | null = null;

    constructor(protected plan: ExecutionPlanImpl, deployment: Deployment) {
        this.elementStatus = makeElementStatus();
    }

    get nodeStatus() {
        if (this.nodeStatus_ == null) {
            throw new Error(`Cannot get nodeStatus except during plan execution`);
        }
        return this.nodeStatus_;
    }

    set nodeStatus(t: StatusTracker) {
        this.nodeStatus_ = t;
    }

    isDeployed = (d: Dependency) => {
        const n = this.plan.getNode(toElemOrWaitInfo(d));
        return nodeIsDeployed(n, this.plan.getId(n), this.nodeStatus);
    }

    makeDependsOn = (current: Handle) => (hands: Handle | Handle[]): Relation => {
        const toEdge = (h: Handle) => Edge(current, h, this.isDeployed);
        const hArray = toArray(hands);
        return hArray.length === 1 ? toEdge(hArray[0]) : And(...hArray.map(toEdge));
    }

    create = (elem: AdaptMountedElement): DeployHelpers => ({
        elementStatus: this.elementStatus,
        isDeployed: this.isDeployed,
        dependsOn: this.makeDependsOn(elem.props.handle),
    })
}
