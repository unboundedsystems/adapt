import { TaskObserver } from "@usys/utils";
import { inspect } from "util";
import { InternalError } from "../error";
import { isBuiltDomElement } from "../jsx";
import { Deployment } from "../server/deployment";
import { DeploymentSequence, ElementStatus, ElementStatusMap, } from "../server/deployment_data";
import {
    DeployStatus,
    EPNode,
    ExecuteComplete,
    isDeployStatus,
    isFinalStatus,
} from "./deploy_types";

export interface StatusTrackerOptions {
    deployment: Deployment;
    dryRun: boolean;
    nodes: EPNode[];
    sequence: DeploymentSequence;
    taskObserver: TaskObserver;
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

export class StatusTracker {
    readonly deployment: Deployment;
    readonly dryRun: boolean;
    readonly nodeStatus: Record<DeployStatus, number>;
    readonly primStatus: Record<DeployStatus, number>;
    readonly statMap: Map<EPNode, DeployStatusExt>;
    readonly taskMap: Map<EPNode, TaskObserver>;
    readonly sequence: DeploymentSequence;

    constructor(options: StatusTrackerOptions) {
        this.deployment = options.deployment;
        this.dryRun = options.dryRun;

        this.nodeStatus = this.newStatus();
        this.nodeStatus.Waiting = options.nodes.length;

        this.primStatus = this.newStatus();

        this.taskMap = new Map<EPNode, TaskObserver>();
        const tGroup = options.taskObserver.childGroup({ serial: false });

        this.statMap = new Map<EPNode, DeployStatusExt>(options.nodes.map((n) => {
            if (n.element) {
                this.primStatus.Waiting++;
                const id = n.element.id;
                const tasks = tGroup.add({ [id]: n.element.componentName });
                this.taskMap.set(n, tasks[id]);
            }
            return [n, DeployStatusExt.Waiting] as [EPNode, DeployStatusExt];
        }));
        this.sequence = options.sequence;
    }

    async initDeploymentStatus(goalStatus: DeployStatus) {
        const deploymentDeployStatus =
            goalStatus === DeployStatus.Deployed ? DeployStatus.Deploying :
            //goalStatus === DeployStatus.Destroyed ? DeployStatus.Destroying :
            undefined;
        if (!deploymentDeployStatus) {
            throw new InternalError(`Invalid goal status ${goalStatus}`);
        }

        if (this.dryRun) return;

        const elementStatus: ElementStatusMap = {};
        this.statMap.forEach((extStatus, n) => {
            const el = n.element;
            if (el == null) return;
            elementStatus[el.id] = { deployStatus: toDeployStatus(extStatus) };
        });
        await this.deployment.status(this.sequence, {
            deployStatus: deploymentDeployStatus,
            goalStatus,
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
        if (statExt === oldStat || isFinalStatusExt(oldStat)) return false;

        const deployStatus = toDeployStatus(statExt);
        const s: ElementStatus = { deployStatus };
        if (err) s.error = err.message;

        this.statMap.set(n, statExt);
        this.updateCount(n, toDeployStatus(oldStat), deployStatus);

        if (!n.element) return true;
        const task = this.taskMap.get(n);
        if (!task) throw new InternalError(`No task observer found for node (${n.element.id})`);
        if (description) task.description = description;

        if (this.dryRun) {
            if (err) task.failed(err);
            else if (deployStatus === DeployStatus.Deployed) task.skipped();

        } else {
            await this.deployment.elementStatus(this.sequence, { [n.element.id]: s });

            if (err) task.failed(err);
            else if (
                deployStatus === DeployStatus.Deploying &&
                oldStat !== DeployStatusExt.ProxyDeploying) task.started();
            else if (deployStatus === DeployStatus.Deployed) task.complete();
        }
        return true;
    }

    isFinal(n: EPNode) {
        return isFinalStatusExt(this.get(n));
    }

    isActive(n: EPNode) {
        return !isFinalStatusExt(this.get(n));
    }

    async complete(): Promise<ExecuteComplete> {
        if (this.nodeStatus.Initial > 0) {
            throw new InternalError(`Nodes should not be in Initial state ${JSON.stringify(this.nodeStatus)}`);
        }
        if (this.nodeStatus.Deploying > 0) {
            throw new InternalError(`Nodes should not be in Deploying state ${JSON.stringify(this.nodeStatus)}`);
        }

        const deploymentStatus =
            (this.nodeStatus.Failed > 0) ? DeployStatus.Failed :
            (this.nodeStatus.Deployed === this.statMap.size) ? DeployStatus.Deployed :
            DeployStatus.Waiting;

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

    private updateCount(n: EPNode, oldStat: DeployStatus, newStat: DeployStatus) {
        this.nodeStatus[oldStat]--;
        this.nodeStatus[newStat]++;
        if (n.element && isBuiltDomElement(n.element)) {
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
