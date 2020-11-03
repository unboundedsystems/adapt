/*
 * Copyright 2019-2020 Unbounded Systems, LLC
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

import { ensureError, formatUserError, MultiError, notNull, sleep, toArray, UserError } from "@adpt/utils";
import AsyncLock from "async-lock";
import db from "debug";
import { alg, Graph } from "graphlib";
import { flatten, isError, isObject } from "lodash";
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
    isElement,
    isMountedElement,
    isPrimitiveElement,
} from "../jsx";
import { Deployment } from "../server/deployment";
import { DeployOpID } from "../server/deployment_data";
import { Status } from "../status";
import {
    Action,
    ChangeType,
    Dependency,
    DeployHelpers,
    DeployOpStatus,
    DeployStatus,
    DeployStatusExt,
    EPPrimitiveDependencies,
    ExecuteComplete,
    ExecuteOptions,
    ExecutionPlan,
    ExecutionPlanOptions,
    GoalStatus,
    goalToInProgress,
    isDependsOn,
    isFinalStatus,
    isInProgress,
    isProxying,
    isRelation,
    Relation,
} from "./deploy_types";
import {
    EPNode,
    EPNodeId,
    EPObject,
    ExecutePassOptions,
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

export function createExecutionPlan(options: ExecutionPlanOptions): ExecutionPlan {
    const plan = new ExecutionPlanImpl(options);

    function addParents(e: AdaptMountedElement) {
        const kids: (AdaptMountedElement | null)[] = e.buildData.origChildren as any || [];
        kids.forEach((child) => isElement(child) && plan.setParent(child, e));
        const succ = e.buildData.successor;
        if (succ) plan.setParent(succ, e);
    }

    const { actions, diff } = options;

    diff.added.forEach((e) => plan.addElem(e, DeployStatus.Deployed));
    diff.commonNew.forEach((e) => plan.addElem(e, DeployStatus.Deployed));
    diff.deleted.forEach((e) => plan.addElem(e, DeployStatus.Destroyed));

    diff.added.forEach(addParents);
    diff.commonNew.forEach(addParents);
    diff.deleted.forEach(addParents);

    plan.addSavedDependencies(options.dependencies);

    // Force memoization of primitiveDependencies. MUST happen before actions
    // are added because adding actions removes primitive Elements from the
    // graph and collapses dependencies.
    plan.computePrimitiveDependencies();

    actions.forEach((a) => plan.addAction(a));

    return plan;
}

export function getWaitInfo(goalStatus: GoalStatus,
    e: AdaptElement | Handle, helpers: DeployHelpers): WaitInfo {

    const hand = isHandle(e) ? e : e.props.handle;
    const elem = hand.mountedOrig;
    if (elem === undefined) throw new InternalError("element has no mountedOrig!");
    if (elem === null) throw new ElementNotInDom();

    if (!elem.built()) {
        return {
            deployedWhen: () => true,
            description: elem.componentName,
        };
    }

    const dependsOn = elem.dependsOn(goalStatus, helpers);

    if (dependsOn && !isDependsOn(dependsOn)) {
        throw new UserError(`Component '${elem.componentName}' dependsOn ` +
            `method returned a value that is not a DependsOn object. ` +
            `[Element id: ${elem.id}] returned: ${inspect(dependsOn)}`);
    }
    const wi: WaitInfo = {
        description: dependsOn ? dependsOn.description : elem.componentName,
        deployedWhen: (gs: GoalStatus) => elem.deployedWhen(gs, helpers),
    };
    if (dependsOn) wi.dependsOn = dependsOn;
    return wi;
}

const elIdToNodeId = (id: ElementID) => "E:" + id;
const elToNodeId = (e: AdaptMountedElement) => "E:" + e.id;

/**
 * Dependency types:
 *
 * - FinishStart: This is also referrred to as a "soft" FinishStart
 *   dependency. It is current the only type of dependency that users can
 *   manually specify, which is done via a `dependsOn` method or related
 *   mechanism. These dependencies are inserted into the plan graph,
 *   but are really checked/enforced by the Relations associated with the
 *   node, not solely by the graph. The reason for this is to support
 *   Relation types besides just a strict dependency, such as a
 *   Relation with a logical "OR". This enables creating a dependency like
 *   waiting for one instance of a failover group to be deployed, rather than
 *   waiting for all instances to be deployed.
 *   When executing a plan, a node that has only incomplete FinishStart
 *   (soft) dependencies remaining will get signaled to check its Relations
 *   every time one of the node's dependencies change to a finished state.
 *
 * - FinishStartHard: This dependency type is the more traditional strict
 *   dependency one might expect in a dependency graph. When N1 depends
 *   on N2 with FinishStartHard type, N1 will not start until N2 finishes.
 *   A node will never get signaled to do any work or check its Relations as long
 *   as it has any FinishStartHard dependencies remaining in the graph. This
 *   dependency type is currently only created via `plan.addSavedDependencies`,
 *   which is used for saved/reanimated DOMs. Note that a node's Relations will
 *   not necessarily have or enforce these dependencies, so the graph must do all
 *   the enforcing.
 *
 * - StartStart: When N1 depends on N2 with a StartStart type, N1 will not start
 *   until N2 has started. These dependencies are created automatically
 *   between an Element and its parent and/or predecessors in the DOM via
 *   `plan.setParent`.
 */
export enum DependencyType {
    FinishStart = "FinishStart",
    FinishStartHard = "FinishStartHard",
    StartStart = "StartStart",
}

export interface EPEdge {
    edgeType: DependencyType;
}

export interface EPDependency {
    id: EPNodeId;
    type: DependencyType;
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
    protected _primitiveDependencies?: EPPrimitiveDependencies;
    protected waitInfoIds = new WeakMap<WaitInfo, string>();

    /** Nodes that are complete or have been replaced in the graph by actions */
    protected nonGraph = new Map<EPNodeId, EPNode>();

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
        // findCycles reports IDs in the opposite direction than we want to
        // work with.
        const allCycles = alg.findCycles(this.graph).map((c) => c.reverse());
        if (allCycles.length === 0) return;
        const toReport: string[][] = [];

        // Cycles that consist solely of StartStart dependencies can be
        // safely broken.
        for (const c of allCycles) {
            if (this.isStartStartCycle(c)) this.breakCycle(c);
            else toReport.push(c);
        }

        if (toReport.length > 0) {
            const cycles = toReport.map(this.printCycleGroups).join("\n");
            if (debugExecute.enabled) {
                debugExecute(`Execution plan dependencies:\n${this.print()}`);
            }
            throw new UserError(`There are circular dependencies present in this deployment:\n${cycles}`);
        }
    }

    /*
     * Semi-private interfaces (for use by this file)
     */
    addElem(element: AdaptMountedElement, goalStatus: GoalStatus): void {
        if (!element || this.hasNode(element)) return;
        const helpers = this.helpers.create(element);
        const waitInfo = getWaitInfo(goalStatus, element, helpers);
        const children = new Set<EPNode>();

        const node: EPNode = { children, element, goalStatus, waitInfo };
        this.addNode(node);
        this.addWaitInfo(node, goalStatus);
    }

    addAction(action: Action) {
        if (action.type === ChangeType.none) return undefined;

        const node: EPNode = {
            children: new Set<EPNode>(),
            goalStatus: changeTypeToGoalStatus(action.type),
            waitInfo: {
                description: action.detail,
                action: action.act,
                actingFor: action.changes,
                activeAction: true,
                deployedWhen: () => true,
                logAction: true,
            }
        };
        this.addNode(node);

        action.changes.forEach((c) => {
            if (c.type === ChangeType.none) return;

            this.addElem(c.element, changeTypeToGoalStatus(c.type));
            const elNode = this.getNode(c.element);
            elNode.waitInfo.activeAction = true;
            elNode.waitInfo.description = action.detail;
            this.setActingFor(node, c.element);
        });
        return node;
    }

    addWaitInfo(nodeOrWI: WaitInfo | EPNode, goalStatus: GoalStatus) {
        let node: EPNode;
        let waitInfo: WaitInfo;
        if (isWaitInfo(nodeOrWI)) {
            node = {
                children: new Set<EPNode>(),
                goalStatus,
                waitInfo: nodeOrWI,
            };
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
                const el = toBuiltElem(h);
                if (el) {
                    // If el has already been added, its goal
                    // status won't change.
                    this.addElem(el, goalStatus);
                    this.addEdge(node, el);
                }
            });
        }
        return node;
    }

    addSavedDependencies(saved: EPPrimitiveDependencies) {
        for (const [id, depList] of Object.entries(saved)) {
            const node = this.getNode(elIdToNodeId(id));
            for (const dep of depList) {
                this.addEdge(node, this.getNode(elIdToNodeId(dep)),
                    DependencyType.FinishStartHard);
            }
        }
    }

    /**
     * Now used only in unit test. Should eventually be removed.
     */
    updateElemWaitInfo(refresh = false) {
        this.nodes.forEach((n) => {
            const el = n.element;
            if (el == null) return;
            if (n.waitInfo != null && !refresh) throw new InternalError(`Expected EPNode.waitInfo to be null`);
            const helpers = this.helpers.create(el);
            n.waitInfo = getWaitInfo(n.goalStatus, el, helpers);

            this.addWaitInfo(n, n.goalStatus);
        });
    }

    addNode(node: EPNode) {
        if (this.hasNode(node)) return;
        this.graph.setNode(this.getId(node, true), node);
    }

    removeDep(obj: EPObject, dependsOn: EPNode) {
        this.removeEdgeInternal(obj, dependsOn);
    }

    removeNode(node: EPNode) {
        const id = this.getId(node);
        this.graph.removeNode(id);
        this.nonGraph.set(id, node);
    }

    predecessors(n: EPNode, edgeType: DependencyType | "all" = "all"): EPNode[] {
        return this.neighbors(n, edgeType, "predecessors");
    }

    successors(n: EPNode, edgeType: DependencyType | "all" = "all"): EPNode[] {
        return this.neighbors(n, edgeType, "successors");
    }

    /**
     * Returns the set of nodes that `n` is acting on behalf of. For an
     * Element node, this will always be an empty array and for an Action
     * node, there should always be at least one node in the array.
     */
    actingFor(n: EPObject): EPNode[] {
        const node = this.getNode(n);
        const fols = node.waitInfo.actingFor?.map((c) => c.element) || [];
        return fols.map(this.getNode);
    }

    setParent(n: EPObject, parent: EPObject) {
        n = this.getNode(n);
        parent = this.getNode(parent);
        parent.children.add(n);
        this.addEdge(n, parent, DependencyType.StartStart);
    }

    /** Returns nodes active in the graph */
    get nodes(): EPNode[] {
        return this.graph.nodes().map(this.getNode);
    }

    /** Returns only nodes NOT active in the graph */
    get nonGraphNodes(): EPNode[] {
        return [ ...this.nonGraph.values() ];
    }

    /** Returns both graph and non-graph nodes */
    get allNodes(): EPNode[] {
        return [ ...this.nodes, ...this.nonGraph.values() ];
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

    toDependencies(type: DependencyType | "all"): EPDependencies {
        const detail = (n: EPNode) => {
            const w = n.waitInfo;
            if (w) return w.description;
            else if (n.element) return n.element.id;
            return "unknown";
        };
        const getDeps = (node: EPNode, id: EPNodeId) => {
            const succs = this.neighbors(node, type, "successors");
            const deps: EPDependency[] = succs.map((n) => {
                const nId = this.getId(n);
                const edge = this.getEdgeInternal(id, nId);
                if (!edge) throw new InternalError(`Consistency check failed: successor without edge ${id}->${nId}`);
                return {
                    id: nId,
                    type: edge.edgeType,
                };
            });
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
        const epDeps = this.toDependencies("all");
        const depIDs = Object.keys(epDeps);
        if (depIDs.length === 0) return "<empty>";

        const succs = (id: string) => {
            const list = epDeps[id] && epDeps[id].deps;
            if (!list || list.length === 0) return "    <none>";
            return list.map((s) => `    ${name(s.id)} [${s.type}]`).join("\n");
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

    get primitiveDependencies(): EPPrimitiveDependencies {
        if (this._primitiveDependencies) return this._primitiveDependencies;
        throw new InternalError(`Must call computePrimitiveDependencies before accessing primitiveDependencies`);
    }

    computePrimitiveDependencies(): void {
        const work = new Map<string, Set<string>>();
        const workFrom = (fromId: string) => {
            const exists = work.get(fromId);
            if (exists) return exists;
            const f = new Set<string>();
            work.set(fromId, f);
            return f;
        };
        const addDep = (from: EPNode, to: EPNode) => {
            if (!from.element) throw new InternalError(`Node '${this.getId(from)}' has no element `);
            const fromId = from.element.id;
            if (!to.element) throw new InternalError(`Node '${this.getId(to)}' has no element `);
            const toId = to.element.id;

            workFrom(fromId).add(toId);
        };

        const ids = alg.isAcyclic(this.graph) ?
            alg.topsort(this.graph) : this.graph.nodes();

        // Insert starting with leaves for a more human-readable ordering
        for (let i = ids.length - 1; i >= 0; i--) {
            const id = ids[i];
            const node = this.getNode(id);

            // Because the start of a node is gated by automatic StartStart
            // dependencies between parents and their children, we only need the
            // pruned dependencies for the "from" set of nodes (prune=true).
            const fromPrims = this.primitiveDependencyTargets(node, true);

            const succs = this.neighbors(node, DependencyType.FinishStart, "successors")
                .concat(this.neighbors(node, DependencyType.FinishStartHard, "successors"));

            // The finish of a node doesn't necessarily include its children
            // because nodes can have custom deployedWhen functions. So ensure
            // we get the complete (non-pruned) set of nodes for the "to"
            // nodes (prune=false).
            const toPrims = flatten(succs.map((s) => this.primitiveDependencyTargets(s, false)));

            for (const from of fromPrims) {
                for (const to of toPrims) {
                    addDep(from, to);
                }
            }
        }

        const finalDeps: EPPrimitiveDependencies = {};
        for (const [from, toSet] of work.entries()) {
            finalDeps[from] = [...toSet];
        }
        this._primitiveDependencies = finalDeps;
    }

    /*
     * Class-internal methods
     */
    protected getIdInternal = (obj: EPObject, create = false): EPNodeId | undefined => {
        const wiId = (w: WaitInfo) => {
            let id = this.waitInfoIds.get(w);
            if (!id) {
                if (!create) return undefined;
                id = "W:" + this.nextWaitId++;
                this.waitInfoIds.set(w, id);
            }
            return id;
        };

        if (isMountedElement(obj)) return elToNodeId(obj);
        if (isWaitInfo(obj)) return wiId(obj);
        if (isMountedElement(obj.element)) return elToNodeId(obj.element);
        if (isWaitInfo(obj.waitInfo)) return wiId(obj.waitInfo);
        throw new InternalError(`Invalid object in getId (${obj})`);
    }

    protected getNodeInternal = (idOrObj: EPNodeId | EPObject): EPNode | undefined => {
        const id =
            typeof idOrObj === "string" ? idOrObj :
            this.getIdInternal(idOrObj);
        if (!id) return undefined;
        return this.graph.node(id) || this.nonGraph.get(id);
    }

    protected getEdgeInternal =
        (idOrObj1: EPNodeId | EPObject, idOrObj2: EPNodeId | EPObject): EPEdge | undefined => {
        const n1 = this.getNodeInternal(idOrObj1);
        const n2 = this.getNodeInternal(idOrObj2);
        if (!n1 || !n2) return undefined;

        const id1 = this.getIdInternal(n1);
        const id2 = this.getIdInternal(n2);
        if (!id1 || !id2) return undefined;

        return this.graph.edge(id1, id2);
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
    protected addEdge(obj: EPObject, dependsOn: EPObject, edgeType = DependencyType.FinishStart) {
        obj = this.getNode(obj);
        dependsOn = this.getNode(dependsOn);
        let a: EPNode;
        let b: EPNode;
        if (edgeType === DependencyType.StartStart) {
            a = obj;
            b = dependsOn;
        } else {
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
        }
        this.addEdgeInternal(a, b, edgeType);
    }

    protected addEdgeInternal(obj: EPObject, dependsOn: EPObject, edgeType: DependencyType) {
        const e: EPEdge = { edgeType };
        const objId = this.getId(obj);
        const depId = this.getId(dependsOn);
        const existing: EPEdge | undefined = this.graph.edge(objId, depId);
        if (existing) {
            const pair = `${existing.edgeType},${edgeType}`;
            switch (pair) {
                case "FinishStart,FinishStart":
                case "FinishStartHard,FinishStartHard":
                case "StartStart,StartStart":
                    return; // No change requested
                case "FinishStart,FinishStartHard":
                    break; // Allowed to upgrade to more restrictive type
                case "FinishStartHard,FinishStart":
                    return; // Leave it at the more restrictive type

                case "FinishStart,StartStart":
                case "FinishStartHard,StartStart":
                case "StartStart,FinishStart":
                case "StartStart,FinishStartHard":
                    throw new Error(`Attempt to add multiple dependencies between the same Elements. ` +
                        `DependencyTypes=${pair} ${objId}->${depId}`);

                default:
                    throw new InternalError(`Unhandled dependency types: ${pair}`);
            }
        }
        this.graph.setEdge(objId, depId, e);
    }

    protected removeEdgeInternal(obj: EPObject, dependsOn: EPObject) {
        const objId = this.getId(obj);
        this.graph.removeEdge(objId, this.getId(dependsOn));
    }

    /**
     * Retrieve predecessors or successors from the graph, optionally
     * filtered for a particular DependencyType.
     */
    protected neighbors(n: EPNode, edgeType: DependencyType | "all",
        which: "predecessors" | "successors"): EPNode[] {

        const nId = this.getId(n);
        // Nodes that have been pulled out of the graph have no neighbors
        if (this.nonGraph.has(nId)) return [];
        let nbors = this.graph[which](nId);
        if (nbors == null) throw new InternalError(`Requested node that's not in graph id=${nId}`);
        if (edgeType !== "all") {
            const getEdge = (nborId: string): EPEdge => {
                const from = which === "predecessors" ? nborId : nId;
                const to = which === "predecessors" ? nId : nborId;
                const e = this.graph.edge(from, to);
                if (!e) throw new InternalError(`No edge '${from}' -> '${to}' but in ${which}`);
                return e;
            };

            nbors = nbors.filter((nbor) => getEdge(nbor).edgeType === edgeType);
        }
        return nbors.map(this.getNode);
    }

    /**
     * Given an Element node N, returns the set of primitive Element
     * nodes that are descendents of N (including N if it's a
     * primitive Element node).
     * If `prune` is true, stop recursively traversing descendents at the first
     * primitive Element node found.
     */
    protected primitiveDependencyTargets = (n: EPNode, prune: boolean): EPNode[] => {
        const prims = new Set<EPNode>();
        function addPrims(node: EPNode) {
            const el = node.element;
            if (!el) return;
            if (isPrimitiveElement(el)) {
                prims.add(node);
                if (prune) return;
            }
            node.children.forEach(addPrims);
        }
        addPrims(n);
        return [...prims];
    }

    protected printCycleGroups = (group: string[]) => {
        if (group.length < 1) throw new InternalError(`Cycle group with no members`);

        const nodeDesc = (n: EPNode, pad = 0) => {
            const desc = n.element?.path || `Action: ${n.waitInfo.description}`;
            return desc.padEnd(pad);
        };

        const ids = [...group, group[0]];
        const nodes = ids.map(this.getNode);
        let padLen = nodes.map((n) => nodeDesc(n).length).reduce((max, cur) => Math.max(max, cur));
        padLen = Math.min(padLen, 65);

        // The dependency type from (i-1) to (i).
        const depType = (i: number) => {
            if (i === 0) return "";
            const e = this.getEdgeInternal(ids[i - 1], ids[i]);
            return `[${e?.edgeType || "??"}]`;
        };
        const short = (n: EPNode, i: number) => {
            const dt = depType(i);
            const idx = i === ids.length - 1 ? 0 : i;
            return `${idx.toString().padStart(2)}: ${nodeDesc(n, padLen)}  ${dt}`;
        };
        const detail = (n: EPNode, i: number) => {
            const info = [];
            const niceId = n.element ? n.element.id : this.getId(n).slice(2);
            info.push(`${i.toString().padStart(2)}: ${nodeDesc(n)}`);
            if (n.element) info.push(`    key: ${n.element.props.key}`);
            info.push(`    id: ${niceId}`);
            return info.join("\n");
        };

        let output = `Dependencies:\n  ${nodes.map(short).join("\n   -> ")}\n`;
        nodes.pop();
        output += `Details:\n${nodes.map(detail).join("\n")}`;

        return output;
    }

    /**
     * Actions always act on behalf of one or more Elements. The Action node
     * replaces the Element nodes in the graph. This means that all of the
     * Element nodes' dependencies are moved over to the Action node and the
     * Element nodes are then removed from the graph.
     */
    protected setActingFor(actionNode: EPNode, elNode: EPObject) {
        elNode = this.getNode(elNode);

        this.successors(elNode).forEach((succ) => {
            const e = this.getEdgeInternal(elNode, succ);
            if (!e) {
                throw new InternalError(`Internal consistency check failed. ` +
                    `node has a successor, but no edge`);
            }
            this.removeEdgeInternal(elNode, succ);
            // Don't create a circular dependency to the actionNode. This can
            // happen when a single Action serves multiple Elements that have
            // dependencies between each other. Simply ignore those.
            if (actionNode === succ) return;
            this.addEdgeInternal(actionNode, succ, e.edgeType);
        });
        this.predecessors(elNode).forEach((pred) => {
            const e = this.getEdgeInternal(pred, elNode);
            if (!e) {
                throw new InternalError(`Internal consistency check failed. ` +
                    `node has a predecessor, but no edge`);
            }
            this.removeEdgeInternal(pred, elNode);
            // Don't create a circular dependency to the actionNode. This can
            // happen when a single Action serves multiple Elements that have
            // dependencies between each other. Simply ignore those.
            if (actionNode === pred) return;
            this.addEdgeInternal(pred, actionNode, e.edgeType);
        });

        this.removeNode(elNode);
    }

    protected isStartStartCycle(cycle: string[]) {
        for (let i = 0; i < cycle.length; ++i) {
            const e = this.getEdgeInternal(cycle[i], cycle[(i + 1) % cycle.length]);
            if (e?.edgeType !== DependencyType.StartStart) return false;
        }
        return true;
}

    protected breakCycle(cycle: string[]) {
        debugExecuteDetail(`Breaking StartStart Cycle by removing ${cycle[0]} -> ${cycle[1]}`);
        this.removeEdgeInternal(this.getNode(cycle[0]), this.getNode(cycle[1]));
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
    ignoreDeleteErrors: false,
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
        nodes: plan.allNodes,
        taskObserver: opts.taskObserver,
    });
    plan.helpers.nodeStatus = nodeStatus;

    try {
        while (true) {
            const stepNum = nodeStatus.stepID ? nodeStatus.stepID.deployStepNum : "DR";
            const stepStr = `${deployOpID}.${stepNum}`;
            debugExecute(`\n\n-----------------------------\n\n` +
                `**** Starting execution step ${stepStr}`);
            debugExecute(`\nExecution plan:\n${plan.print()}`);

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
            await Promise.all(
                plan.allNodes
                .filter((n) => !nodeIsFinal(n, nodeStatus))
                .map((n) => nodeStatus.set(n, DeployStatus.Failed, err))
            );
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
    const fatalErrors: Error[] = [];

    // If an action is on behalf of some Elements, those nodes take on
    // the status of the action in certain cases.
    const signalActingFor = async (node: EPNode, stat: DeployStatusExt, err: Error | undefined) => {
        const w = node.waitInfo;
        if (!w || !w.actingFor) return;
        if (shouldNotifyActingFor(stat)) {
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
        }

        // Queue the actingFor Elements for successful final states so they
        // can run their deployedWhen and possibly also transition to a
        // final state.
        if (shouldQueueActingFor(stat)) {
            w.actingFor
                .map((c) => plan.getNode(c.element))
                .forEach(queueRun);
        }
    };

    const signalPreds = (n: EPNode, stat: DeployStatusExt) => {
        let toSignal: EPNode[];

        if (isFinalStatus(stat)) {
            // Signal predecessors that depend on our Finish
            toSignal = plan.predecessors(n, DependencyType.FinishStart)
                .concat(plan.predecessors(n, DependencyType.FinishStartHard));
        } else if (isInProgress(stat) || isProxying(stat)) {
            // Signal predecessors that depend on our Start
            toSignal = plan.predecessors(n, DependencyType.StartStart);
        } else {
            return;
        }

        // Each toSignal dependency has been satisfied. In successful cases,
        // remove all the dependencies onto `n`.
        // In the error case, leave dependencies in place so the
        // predecessors can use those relationships to realize they depend
        // on an errored node and signal their predecessors.
        if (stat !== DeployStatus.Failed) {
            toSignal.forEach((pred) => plan.removeDep(pred, n));
        }
        toSignal.forEach(queueRun);
    };

    const fatalError = (err: any) => {
        stopExecuting = true;
        fatalErrors.push(ensureError(err));
    };

    const queueRun = (n: EPNode) => queue.add(() => run(n)).catch(fatalError);

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
                let errorIgnored = false;

                if (!(isInProgress(stat) || isProxying(stat))) {
                    await updateStatus(n, goalToInProgress(n.goalStatus)); // now in progress

                    if (w.action) {
                        debugExecId(id, `ACTION: Doing ${w.description}`);
                        if (w.logAction) logger.info(`Doing ${w.description}`);
                        try {
                            if (!dryRun) await w.action();
                        } catch (err) {
                            if (n.goalStatus === GoalStatus.Destroyed && opts.ignoreDeleteErrors) {
                                errorIgnored = true;
                                logger.warning(`--Error (ignored) while ${w.description}\n${err}\n----------`);
                            } else {
                                logger.error(`--Error while ${w.description}\n${err}\n----------`);
                                errorLogged = true;
                                throw err;
                            }
                        }
                    }
                }
                if (!errorIgnored) {
                    const wStat = await w.deployedWhen(n.goalStatus);
                    if (wStat !== true) {
                        const statStr = waitStatusToString(wStat);
                        debugExecId(id, `NOT COMPLETE: ${w.description}: ${statStr}`);
                        nodeStatus.output(n, statStr);
                        dwQueue.enqueue(n, id, wStat);
                        return;
                    }
                }
                debugExecId(id, `COMPLETE${errorIgnored ? "(error ignored)" : ""}: ${w.description}`);

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
            signalPreds(n, deployStatus);
            if (isFinalStatus(deployStatus) && n.element) {
                dwQueue.completed(n.element, queueRun);
            }
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
        const succs = plan.successors(n, DependencyType.FinishStart)
            .concat(plan.successors(n, DependencyType.FinishStartHard));
        debugExecDetailId(mkIdStr(ids), `  Evaluating: ${succs.length} successors`);
        for (const s of succs) {
            // TODO: There probably needs to be a check here comparing
            // goalStatus for s and n, similar to addEdge.
            const sId = plan.getId(s);
            if (!waitIsReady(s, true, [...ids, sId])) return false;

            // Evaluate successor's actingFor the same way
            const actingFor = plan.actingFor(s);
            for (const a of actingFor) {
                const aId = plan.getId(a);
                if (!waitIsReady(a, true, [...ids, sId, aId])) return false;
            }
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
        const hardDeps = plan.successors(n, DependencyType.FinishStartHard);

        // Check for errors in our dependencies first. Throws on errored dep.
        hardDeps.forEach((d) => nodeIsDeployed(d, id, nodeStatus));

        if (hardDeps.length > 0) {
            debugExecId(id, `Dependencies not met: ${hardDeps.length} FinishStartHard dependencies remaining`);
            return false;
        }

        if (!softDepsReady(n, [id])) {
            debugExecId(id, `Dependencies not met: FinishStart (soft) dependencies remaining`);
            return false;
        }

        const actingFor = plan.actingFor(n);
        debugExecDetailId(id, `  Evaluating: ${actingFor.length} actingFor elements`);
        for (const a of actingFor) {
            const aStat = nodeStatus.get(a);
            const aId = plan.getId(a);
            if (!isWaiting(aStat)) {
                throw new InternalError(`Invalid status ${aStat} for actingFor element ${aId}`);
            }
            if (!softDepsReady(a, [id, aId])) {
                debugExecId(id, `Dependencies not met: actingFor elements have incomplete dependencies`);
                return false;
            }
        }

        return true;
    };

    /*
     * Main execute code path
     */
    try {
        // Queue any non-graph nodes that are already in progress so they
        // can check their completions.
        plan.nonGraphNodes.filter((n) => nodeIsActive(n, nodeStatus)).forEach(queueRun);

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
        fatalError(err);
    }

    if (fatalErrors.length > 1) throw new MultiError(fatalErrors);
    else if (fatalErrors.length === 1) throw fatalErrors[0];
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

function shouldQueueActingFor(status: DeployStatusExt) {
    switch (status) {
        case DeployStatus.Deployed:
        case DeployStatus.Destroyed:
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

function toBuiltElemOrWaitInfo(val: Handle | AdaptMountedElement | WaitInfo): AdaptMountedElement | WaitInfo | null {
    return isWaitInfo(val) ? val : toBuiltElem(val);
}

function toBuiltElem(val: Handle | AdaptMountedElement): AdaptMountedElement | null {
    if (isMountedElement(val)) {
        if (val.built()) return val;
        val = val.props.handle;
    }
    if (!isHandle(val)) {
        throw new Error(`Attempt to convert an invalid object to Element or WaitInfo: ${inspect(val)}`);
    }
    const elem = val.nextMounted((el) => isMountedElement(el) && el.built());
    if (elem === undefined) throw new InternalError("Handle has no built Element!");
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

function nodeIsActive(n: EPNode, tracker: StatusTracker): boolean {
    const sStat = tracker.get(n);
    return isInProgress(sStat) || isProxying(sStat);
}

function nodeIsFinal(n: EPNode, tracker: StatusTracker): boolean {
    const sStat = tracker.get(n);
    return isFinalStatus(sStat);
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
        if (isRelation(d)) return relationIsReady(d);

        const elOrWait = toBuiltElemOrWaitInfo(d);
        if (elOrWait === null) return true; // Handle built to null - null is deployed
        const n = this.plan.getNode(elOrWait);
        return nodeIsDeployed(n, this.plan.getId(n), this.nodeStatus);
    }

    makeDependsOn = (current: Handle) => (hands: Handle | Handle[]): Relation => {
        const toEdge = (h: Handle) => Edge(current, h, this.isDeployed);
        return And(...toArray(hands).map(toEdge));
    }

    create = (elem: AdaptMountedElement): DeployHelpers => ({
        elementStatus: this.elementStatus,
        isDeployed: this.isDeployed,
        dependsOn: this.makeDependsOn(elem.props.handle),
    })
}
