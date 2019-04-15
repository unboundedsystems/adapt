import { ensureError, notNull, sleep, UserError } from "@usys/utils";
import AsyncLock from "async-lock";
import db from "debug";
import { alg, Graph } from "graphlib";
import { isError, isObject } from "lodash";
import PQueue from "p-queue";
import pTimeout from "p-timeout";
import { inspect } from "util";
import { buildHelpers } from "../dom";
import { domActiveElems } from "../dom_utils";
import { ElementNotInDom, InternalError } from "../error";
import { Handle, isHandle } from "../handle";
import { AdaptElement, AdaptMountedElement, isMountedElement } from "../jsx";
import {
    Action,
    Dependency,
    DependsOn,
    DeployHelpers,
    DeployStatus,
    DeployStatusExt,
    EPNode,
    EPNodeId,
    EPObject,
    ExecuteComplete,
    ExecuteOptions,
    ExecutePassOptions,
    ExecutionPlan,
    ExecutionPlanOptions,
    isFinalStatusExt,
    isWaitInfo,
    WaitInfo,
} from "./deploy_types";
import { createStatusTracker } from "./status_tracker";

const debugExecute = db("adapt:deploy:execute");

export async function createExecutionPlan(options: ExecutionPlanOptions): Promise<ExecutionPlan> {
    const { actions, diff, seriesActions } = options;

    const elems = domActiveElems(diff);
    const plan = new ExecutionPlanImpl(options.goalStatus);

    elems.forEach((e) => plan.addElem(e));
    actions.forEach((a) => plan.addAction(a));
    if (seriesActions) {
        seriesActions.forEach((group) => {
            let prev: EPNode | undefined;
            group.forEach((a) => {
                const node = plan.addAction(a);
                if (prev) plan.addDep(node, prev);
                prev = node;
            });
        });
    }
    plan.updateElemDepends();

    return plan;
}

export function getDependsOn(goalStatus: DeployStatus.Deployed,
    e: AdaptElement | Handle): WaitInfo | undefined {

    const hand = isHandle(e) ? e : e.props.handle;
    const elem = hand.mountedOrig;
    if (elem === undefined) throw new InternalError("element has no mountedOrig!");
    if (elem === null) throw new ElementNotInDom();

    const dep = elem.dependsOn(goalStatus);
    if (dep === undefined) return undefined;

    if (!isWaitInfo(dep)) {
        throw new UserError(`Component '${elem.componentName}' dependsOn ` +
            `method returned a value that is not a DependsOn object. ` +
            `[Element id: ${elem.id}] returned: ${inspect(dep)}`);
    }
    return dep;
}

export class ExecutionPlanImpl implements ExecutionPlan {
    protected graph = new Graph();
    protected nextWaitId = 0;
    protected waitInfoIds = new WeakMap<WaitInfo, string>();

    constructor(readonly goalStatus: DeployStatus.Deployed) {}

    /*
     * Public interfaces
     */
    check() {
        const cycleGroups = alg.findCycles(this.graph);
        if (cycleGroups.length > 0) {
            const cycles = cycleGroups.map(printCycleGroups).join("\n");
            throw new Error(`There are circular dependencies present in this deployment:\n${cycles}`);
        }
    }

    /*
     * Semi-private interfaces (for use by this file)
     */
    addElem(element: AdaptMountedElement) {
        const node: EPNode = { element };
        this.addNode(node);
        return node;
    }

    addAction(action: Action) {
        const node: EPNode = {
            waitInfo: {
                description: action.detail,
                status: () => ({ done: true }),
                action: action.act,
                actingFor: action.changes,
                logAction: true,
            }
        };
        this.addNode(node);

        action.changes.forEach((c) => {
            this.addElem(c.element);
            this.addDep(c.element, node);
        });
        return node;
    }

    addWaitInfo(waitInfo: WaitInfo, element?: AdaptMountedElement) {
        let node: EPNode = { waitInfo };
        if (element) node.element = element;

        const existing = this.getNodeInternal(node);
        if (existing) {
            existing.waitInfo = waitInfo;
            node = existing;
        } else {
            this.addNode(node);
        }

        if (waitInfo.dependsOn) {
            waitInfo.dependsOn.forEach((d) => {
                if (isHandle(d)) {
                    if (!d.associated) {
                        // TODO: Add info about the handle, like traceback for
                        // where it was created.
                        throw new UserError(
                            `A Component dependsOn method returned a DependsOn ` +
                            `object '${waitInfo.description}' that contains ` +
                            `a Handle that is not associated with any Element`);
                    }
                    if (d.mountedOrig) {
                        this.addElem(d.mountedOrig);
                        this.addDep(node, d.mountedOrig);
                    }
                } else if (isWaitInfo(d)) {
                    const n = this.addWaitInfo(d);
                    this.addDep(node, n);
                } else {
                    throw new UserError(
                        `A Component dependsOn method returned a DependsOn ` +
                        `object '${waitInfo.description}' that contains ` +
                        `an invalid dependency: ${inspect(d)}`);
                }
            });
        }
        return node;
    }

    updateElemDepends() {
        this.elems.forEach((el) => {
            const wi = getDependsOn(this.goalStatus, el);
            if (wi == null) return;
            this.addWaitInfo(wi, el);
        });
    }

    addNode(node: EPNode) {
        if (this.hasNode(node)) return;
        this.graph.setNode(this.getId(node, true), node);
    }

    addDep(obj: EPObject, dependsOn: EPObject) {
        this.graph.setEdge(this.getId(obj), this.getId(dependsOn));
    }

    removeNode(node: EPNode) {
        this.graph.removeNode(this.getId(node));
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
        if (!id) throw new Error(`ID not found`);
        return id;
    }

    getNode = (idOrObj: EPNodeId | EPObject): EPNode => {
        const node = this.getNodeInternal(idOrObj);
        if (!node) throw new Error(`Node not found`);
        return node;
    }

    hasNode = (idOrObj: EPNodeId | EPObject): boolean => {
        return this.getNodeInternal(idOrObj) != null;
    }

    print() {
        const succs = (id: string) => {
            const list = this.graph.successors(id);
            if (!list || list.length === 0) return "  <none>";
            return list.map((s) => "  " + name(s)).join("\n");
        };
        const name = (id: string) => {
            const w = this.getNode(id).waitInfo;
            if (w) id += " : " + w.description;
            return id;
        };

        return alg.topsort(this.graph)
            .map((id) => `${name(id)}\n${succs(id)}`)
            .join("\n");
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
        return this.graph.node(id);
    }

}

function isExecutionPlanImpl(val: any): val is ExecutionPlanImpl {
    return isObject(val) && val instanceof ExecutionPlanImpl;
}

function debugExecId(id: string, ...args: any[]) {
    debugExecute(`* ${(id as any).padEnd(20)}`, ...args);
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
    let loopNum = 0;

    if (!isExecutionPlanImpl(plan)) throw new InternalError(`plan is not an ExecutionPlanImpl`);

    const nodeStatus = await createStatusTracker({
        dryRun: opts.dryRun,
        deployment: opts.deployment,
        goalStatus: plan.goalStatus,
        nodes: plan.nodes,
        sequence: opts.sequence,
        taskObserver: opts.taskObserver,
    });

    try {
        while (true) {
            debugExecute(`\n\n-----------------------------\n\n**** Starting execution pass ${++loopNum}`);

            const ret = await executePass({ ...opts, nodeStatus, timeoutTime });

            debugExecute(`**** execution pass ${loopNum} status: ${ret.deploymentStatus}\nSummary:`,
                inspect(ret), "\n", nodeStatus.debug(plan.getId), "\n-----------------------------\n\n");
            if (isFinalStatusExt(ret.deploymentStatus)) {
                debugExecute(`**** Execution completed`);
                return ret;
            }
            await sleep(opts.pollDelayMs);
        }

    } catch (err) {
        err = ensureError(err);
        opts.logger.error(`Deploy operation failed: ${err.message}`);

        debugExecute(`**** Execution failed:`, inspect(err));
        if (err.name === "TimeoutError") {
            //TODO : Mark all un-deployed as timed out
            for (const n of plan.nodes) {
                await nodeStatus.set(n, DeployStatus.Failed, err);
            }
            return nodeStatus.complete();

        } else {
            throw err;
        }
    }
}

export async function executePass(opts: ExecutePassOptions): Promise<ExecuteComplete> {
    const { dryRun, deployment, logger, nodeStatus, plan } = opts;

    if (!isExecutionPlanImpl(plan)) throw new InternalError(`plan is not an ExecutionPlanImpl`);

    //TODO: Remove
    debugExecute(plan.print());

    const locks = new AsyncLock();
    const queue = new PQueue({ concurrency: opts.concurrency });
    let stopExecuting = false;

    const bHelpers = buildHelpers(deployment);
    const helpers: DeployHelpers = {
        elementStatus: bHelpers.elementStatus,
        isDeployed: (d: Dependency) => {
            const stat = nodeStatus.get(plan.getNode(toElemOrWaitInfo(d)));
            return stat === plan.goalStatus;
        }
    };

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
                stat;
            await updateStatus(n, s, c.detail);
        }));
    };

    const signalPreds = async (n: EPNode, stat: DeployStatusExt) => {
        if (!isFinalStatusExt(stat)) return;
        plan.predecessors(n).forEach(queueRun);
    };

    const queueRun = (n: EPNode) => queue.add(() => run(n));

    const run = async (n: EPNode) => {
        const id = plan.getId(n);
        await locks.acquire(id, () => runLocked(n, id));
    };

    const runLocked = async (n: EPNode, id: EPNodeId) => {
        try {
            if (stopExecuting) return debugExecId(id, `TIMED OUT: Can't start task`);

            // TODO: use logger
            const stat = nodeStatus.get(n);
            if (isFinalStatusExt(stat)) return debugExecId(id, `Already complete`);
            if (!(isWaiting(stat) || stat === DeployStatus.Deploying)) {
                throw new InternalError(`Unexpected node status ${stat}: ${id}`);
            }

            if (!dependenciesMet(n)) {
                debugExecId(id, `NOTYET: Dependencies not met`);
                return;
            }

            const w = n.waitInfo;
            if (w) {
                debugExecId(id, `  Evaluating ${w.description}`);
                if ((await waitIsReady(w)) !== true) {
                    debugExecId(id, `NOTYET: not ready: ${w.description}`);
                    return;
                }

                await updateStatus(n, DeployStatus.Deploying); // now in progress

                if (w.action) {
                    debugExecId(id, `ACTION: Doing ${w.description}`);
                    if (w.logAction) logger.info(`Doing ${w.description}`);
                    try {
                        if (!dryRun) await w.action(helpers);
                    } catch (err) {
                        logger.error(`--Error while ${w.description}\n${err}\n----------`);
                        throw err;
                    }
                }
                const wStat = await w.status(helpers);
                if (!wStat.done) {
                    debugExecId(id, `NOT COMPLETE: ${w.description}: ${wStat.status}`);
                    nodeStatus.output(n, wStat.status);
                    return;
                }
                debugExecId(id, `COMPLETE: ${w.description}`);

            } else {
                debugExecId(id, `  No wait info`);
                // Go through normal state transition to Deploying to
                // trigger correct downstream events to TaskObservers.
                await updateStatus(n, DeployStatus.Deploying);
            }
            await updateStatus(n, DeployStatus.Deployed);
            plan.removeNode(n);

        } catch (err) {
            debugExecId(id, `FAILED: ${err}`);
            await updateStatus(n, err);
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

    const waitIsReady = async (w: WaitInfo): Promise<boolean> => {
        if (w.dependsOn == null) return true;

        for (const i of w.dependsOn) {
            if (isHandle(i)) {
                const el = i.mountedOrig;
                // TODO
                if (!el) throw new Error(`TODO: What's the right behavior for this?`);

                const stat = nodeStatus.get(plan.getNode(el));
                if (stat === DeployStatus.Failed) {
                    throw new Error(`Cannot deploy: Dependency ${el.id} failed to deploy`);
                }
                if (stat !== DeployStatus.Deployed) return false;

            } else if ((await waitIsReady(i)) === false) return false;
        }
        return true;
    };

    const dependenciesMet = (n: EPNode): boolean => {
        const succs = plan.successors(n);
        for (const s of succs) {
            const sStat = nodeStatus.get(s);
            switch (sStat) {
                case DeployStatusExt.Deployed:
                    break; // Dependency met
                case DeployStatusExt.Waiting:
                case DeployStatusExt.Deploying:
                case DeployStatusExt.ProxyDeploying:
                    return false;
                case DeployStatusExt.Failed:
                    throw new Error(`A dependency failed to deploy successfully`);
                default:
                    throw new InternalError(`Invalid status ${sStat} for ${plan.getId(s)}`);
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
            pIdle = pTimeout(pIdle, opts.timeoutTime - Date.now(), msg);
        }
        await pIdle;

        return await nodeStatus.complete();

    } catch (err) {
        stopExecuting = true;
        throw err;
    }
}

function shouldNotifyActingFor(status: DeployStatusExt) {
    switch (status) {
        case DeployStatus.Deploying:
        //case DeployStatus.Destroying:
        //case DeployStatus.Retrying:
        case DeployStatus.Failed:
            return true;
        default:
            return false;
    }
}

function isWaiting(stat: DeployStatusExt) {
    return  stat === DeployStatusExt.Waiting || stat === DeployStatusExt.ProxyDeploying;
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
