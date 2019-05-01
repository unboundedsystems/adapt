import { TaskObserver } from "@usys/utils";
import { inspect } from "util";
import { InternalError } from "../error";
import { AdaptMountedElement, isFinalDomElement, isMountedElement } from "../jsx";
import { Deployment } from "../server/deployment";
import { DeploymentSequence, ElementStatus, ElementStatusMap, } from "../server/deployment_data";
import {
    DeployStatus,
    DeployStatusExt,
    ExecuteComplete,
    GoalStatus,
    goalToInProgress,
    isFinalStatus,
    isGoalStatus,
    isInProgress,
    isProxying,
    toDeployStatus,
} from "./deploy_types";
import {
    EPNode,
    StatusTracker,
} from "./deploy_types_private";

export interface StatusTrackerOptions {
    deployment: Deployment;
    dryRun: boolean;
    goalStatus: GoalStatus;
    nodes: EPNode[];
    sequence: DeploymentSequence;
    taskObserver: TaskObserver;
}

export async function createStatusTracker(options: StatusTrackerOptions): Promise<StatusTracker> {
    const tracker = new StatusTrackerImpl(options);
    await tracker.initDeploymentStatus();
    return tracker;
}

export class StatusTrackerImpl implements StatusTracker {
    readonly deployment: Deployment;
    readonly dryRun: boolean;
    readonly goalStatus: GoalStatus;
    readonly nodeStatus: Record<DeployStatus, number>;
    readonly primStatus: Record<DeployStatus, number>;
    readonly statMap: Map<EPNode, DeployStatusExt>;
    readonly taskMap: Map<EPNode, TaskObserver>;
    readonly sequence: DeploymentSequence;

    constructor(options: StatusTrackerOptions) {
        this.deployment = options.deployment;
        this.dryRun = options.dryRun;
        this.goalStatus = options.goalStatus;

        this.nodeStatus = this.newStatus();
        this.nodeStatus.Waiting = options.nodes.length;

        this.primStatus = this.newStatus();

        this.taskMap = new Map<EPNode, TaskObserver>();
        const tGroup = options.taskObserver.childGroup({ serial: false });

        this.statMap = new Map<EPNode, DeployStatusExt>(options.nodes.map((n) => {
            if (n.element) {
                this.primStatus.Waiting++;
                if (shouldTrackStatus(n)) {
                    const id = n.element.id;
                    const tasks = tGroup.add({ [id]: n.element.componentName });
                    this.taskMap.set(n, tasks[id]);
                }
            }
            return [n, DeployStatusExt.Waiting] as [EPNode, DeployStatusExt];
        }));
        this.sequence = options.sequence;
    }

    async initDeploymentStatus() {
        const deploymentDeployStatus = goalToInProgress(this.goalStatus);
        if (this.dryRun) return;

        const elementStatus: ElementStatusMap = {};
        this.statMap.forEach((extStatus, n) => {
            const el = n.element;
            if (el == null) return;
            elementStatus[el.id] = { deployStatus: toDeployStatus(extStatus) };
        });
        await this.deployment.status(this.sequence, {
            deployStatus: deploymentDeployStatus,
            goalStatus: this.goalStatus,
            elementStatus,
        });
    }

    get(n: EPNode) {
        const stat = this.statMap.get(n);
        if (stat === undefined) {
            throw new InternalError(`Unrecognized node: ${inspect(n)}`);
        }
        return stat;
    }

    // Returns true when status was changed, false when node was already
    // in a final state or already in the requested state.
    async set(n: EPNode, statExt: DeployStatusExt, err: Error | undefined,
        description?: string) {
        const oldStat = this.get(n);
        if (statExt === oldStat || isFinalStatus(oldStat)) return false;

        const deployStatus = toDeployStatus(statExt);

        this.statMap.set(n, statExt);
        this.updateCount(n, toDeployStatus(oldStat), deployStatus);

        this.updateTask(n, oldStat, deployStatus, err, description);
        await this.updateStatus(n, err);

        return true;
    }

    isFinal(n: EPNode) {
        return isFinalStatus(this.get(n));
    }

    isActive(n: EPNode) {
        return !isFinalStatus(this.get(n));
    }

    output(n: EPNode, s: string) {
        const task = this.getTask(n);
        if (!task) return;
        task.updateStatus(s);
    }

    async complete(): Promise<ExecuteComplete> {
        if (this.nodeStatus.Initial > 0) {
            throw new InternalError(`Nodes should not be in Initial state ${JSON.stringify(this.nodeStatus)}`);
        }

        const atGoal = this.nodeStatus.Deployed + this.nodeStatus.Destroyed;
        const deploymentStatus =
            (this.nodeStatus.Failed > 0) ? DeployStatus.Failed :
            (atGoal === this.statMap.size) ? this.goalStatus :
            goalToInProgress(this.goalStatus);

        if (!this.dryRun) {
            await this.deployment.status(this.sequence, { deployStatus: deploymentStatus });
        }

        return {
            deploymentStatus,
            nodeStatus: this.nodeStatus,
            primStatus: this.primStatus,
        };
    }

    debug(getId: (n: EPNode) => string) {
        const entries = [...this.statMap]
            .map(([n, stat]) => `  ${(getId(n) as any).padEnd(20)} => ${stat}`)
            .join("\n");
        return `StatusTracker {\n${entries}\n}`;
    }

    private getTask(n: EPNode) {
        if (!shouldTrackStatus(n)) return undefined;
        const task = this.taskMap.get(n);
        if (!task) {
            throw new InternalError(`No task observer found for node (${n.element && n.element.id})`);
        }
        return task;
    }

    private async updateStatus(n: EPNode, err: Error | undefined) {
        if (n.element == null || this.dryRun) return;

        const statExt = this.get(n);
        const deployStatus = toDeployStatus(statExt);
        const s: ElementStatus = { deployStatus };
        if (err) s.error = err.message;
        await this.deployment.elementStatus(this.sequence, { [n.element.id]: s });
    }

    private updateTask(n: EPNode, oldStat: DeployStatusExt, newStat: DeployStatus,
        err: Error | undefined, description: string | undefined) {

        const task = this.getTask(n);
        if (!task) return;

        if (description) task.description = description;

        if (err) return task.failed(err);

        if (this.dryRun) {
            if (isGoalStatus(newStat)) task.skipped();

        } else {
            if (isInProgress(newStat) && !isProxying(oldStat)) task.started();
            else if (isGoalStatus(newStat)) task.complete();
        }
    }

    private updateCount(n: EPNode, oldStat: DeployStatus, newStat: DeployStatus) {
        this.nodeStatus[oldStat]--;
        this.nodeStatus[newStat]++;
        if (n.element && isFinalDomElement(n.element)) {
            this.primStatus[oldStat]--;
            this.primStatus[newStat]++;
        }
    }

    private newStatus(): Record<DeployStatus, number> {
        const stat: any = {};
        Object.keys(DeployStatus).forEach((k) => stat[k] = 0);
        return stat;
    }
}

export function shouldTrackStatus(n: EPNode | AdaptMountedElement) {
    const el = isMountedElement(n) ? n : n.element;
    if (!el) return false;
    return el.componentType.noPlugin !== true;
}
