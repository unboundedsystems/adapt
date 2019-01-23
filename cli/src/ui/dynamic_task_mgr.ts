import { badTaskEvent, MessageClient, TaskEvent, TaskGroupOptions, TaskState } from "@usys/utils";
import Listr from "listr";
import pDefer from "p-defer";

export interface DynamicTaskDef {
    id: string;
    title: string;
    initiate?: (context: any, task: Listr.ListrTaskWrapper) => any | Promise<any>;
    adoptable?: boolean;
    // If task is a child group, allow the group to run when this many tasks
    // have been Created in the group. Minimum 1. Default=1.
    runOnChildTask?: number;
}

export function addDynamicTask(
    listr: Listr,    // The listr where this dynamic task will be added
    listrId: string, // The task ID that corresponds to this listr
    msgClient: MessageClient,
    taskDef: DynamicTaskDef) {

    const registry = new TaskRegistry(listr, listrId);

    // Listen for all task events for all tasks in the task hierarchy under taskDef.id
    msgClient.task.on(`task:*:${taskDef.id}:**`, (event, status, from) => {
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
    childTasksNeeded: number;
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

    constructor(private rootListr: Listr, private rootListrId: string) { }

    get(id: string) { return this.tasks.get(id); }
    set(id: string, tStatus: ListrTaskStatus) { return this.tasks.set(id, tStatus); }

    getParent(child: string): ListrTaskStatus | undefined {
        const parentId = parent(child);
        if (parentId === this.rootListrId) return undefined;
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

const createTaskDefaults = {
    adoptable: false,
    runOnChildTask: 1,
};

function createTask(registry: TaskRegistry, taskDef: DynamicTaskDef) {
    const def = { ...createTaskDefaults, ...taskDef };
    const { id, title, initiate, adoptable, runOnChildTask } = def;

    if (!Number.isInteger(runOnChildTask) || runOnChildTask < 1) {
        throw new Error(`createTask: runOnChildTask must be an integer >= 1`);
    }
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
            childTasksNeeded: runOnChildTask,
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
    if (parentStat && parentStat.childGroup && parentStat.childTasksNeeded > 0) {
        if (--parentStat.childTasksNeeded === 0) {
            parentStat.dPromise.resolve(parentStat.childGroup);
        }
    }
}
