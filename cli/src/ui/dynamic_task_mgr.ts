import { badTaskEvent, MessageClient, TaskEvent, TaskGroupOptions, TaskState } from "@usys/utils";
import Listr from "listr";
import pDefer from "p-defer";

export interface DynamicTaskDef {
    id: string;
    title: string;
    initiate?: (context: any, task: Listr.ListrTaskWrapper) => any | Promise<any>;
    adoptable?: boolean;
}

export function addDynamicTask(
    listr: Listr,
    msgClient: MessageClient,
    taskDef: DynamicTaskDef) {

    const registry = new TaskRegistry(listr);

    msgClient.task.on("task:**", (event, status, from) => {
        if (event === TaskEvent.Created) {
            createTask(registry, {
                id: from,
                title: status || "Unknown task name",
            });
        } else {
            updateTask(registry, from, event, status);
        }
    });

    createTask(registry, taskDef);
}

interface ListrTaskStatus {
    id: string;
    event: TaskState;
    status: string | undefined;
    adoptable: boolean;
    task?: Listr.ListrTaskWrapper;
    childGroup?: Listr;
    dPromise: pDefer.DeferredPromise<void | Listr>;
    childGroupStarted?: boolean;
}

function parent(id: string) {
    const lastColon = id.lastIndexOf(":");
    return lastColon > 0 ? id.slice(0, lastColon) : "";
}

function updateTask(registry: TaskRegistry, id: string, event?: TaskEvent, status?: string) {
    const taskStatus = registry.get(id);
    if (!taskStatus) throw new Error(`Task ${id} got event ${event} but was never created`);

    const task = taskStatus.task;

    if (event == null) event = taskStatus.event;
    else if (event !== TaskEvent.ChildGroup && event !== TaskEvent.Status) {
        taskStatus.event = event;
    }

    if (status == null) status = taskStatus.status;
    else taskStatus.status = status;

    switch (event) {
        case TaskEvent.Complete:
            taskStatus.dPromise.resolve();
            break;
        case TaskEvent.Skipped:
            if (task) task.skip(status || "");
            break;
        case TaskEvent.Failed:
            taskStatus.dPromise.reject(new Error(status));
            break;
        case TaskEvent.Status:
            if (task) task.output = status;
            break;
        case TaskEvent.Created:
        case TaskEvent.Started:
            break;
        case TaskEvent.ChildGroup:
            if (!status) throw new Error(`Received event ChildGroup without status`);
            let opts: TaskGroupOptions;
            try {
                opts = JSON.parse(status);
            } catch (err) {
                throw new Error(`Received ChildGroup event but could not parse options`);
            }
            taskStatus.childGroup = new Listr({ concurrent: !opts.serial });
            break;
        default: return badTaskEvent(event);
    }
}

class TaskRegistry {
    tasks = new Map<string, ListrTaskStatus>();

    constructor(readonly rootListr: Listr) {}

    get(id: string) { return this.tasks.get(id); }
    set(id: string, tStatus: ListrTaskStatus) { return this.tasks.set(id, tStatus); }

    getParent(child: string): ListrTaskStatus | undefined {
        const parentId = parent(child);
        if (parentId === "") return undefined;
        const parentStatus = this.get(parentId);
        if (!parentStatus) throw new Error(`Can't find parent status for ${parentId} for child ${child}`);
        return parentStatus;
    }

    getParentListr(child: string): Listr {
        const parentStatus = this.getParent(child);
        if (!parentStatus) return this.rootListr;
        if (!parentStatus.childGroup) throw new Error(`Parent ${parent(child)} has no task group`);
        return parentStatus.childGroup;
    }
}

function createTask(registry: TaskRegistry, taskDef: DynamicTaskDef) {
    const { id, title, initiate, adoptable = false } = taskDef;
    let tStatus = registry.get(id);

    if (tStatus) {
        if (!tStatus.adoptable) throw new Error(`Task ${id} has already been created`);
        return;
    } else {
        tStatus = {
            id,
            event: TaskState.Created,
            status: undefined,
            adoptable,
            dPromise: pDefer(),
        };
        registry.set(id, tStatus);
    }

    const taskgroup = registry.getParentListr(id);
    taskgroup.add({
        title,
        task: (ctx, task) => {
            const cur = registry.get(id);
            if (!cur) throw new Error(`Cannot find task ${id}`);
            if (cur.task) throw new Error(`Task ${id} already has a task object`);
            cur.task = task;
            updateTask(registry, id);

            if (initiate) {
                const ret = initiate(ctx, task);
                return Promise.resolve(ret)
                    .then(() => cur.dPromise.promise);
            }
            return cur.dPromise.promise;
        }
    });

    // Allow the task group to run once there's a task in the group
    const parentStat = registry.getParent(id);
    if (parentStat && parentStat.childGroup && !parentStat.childGroupStarted) {
        parentStat.childGroupStarted = true;
        parentStat.dPromise.resolve(parentStat.childGroup);
    }
}
