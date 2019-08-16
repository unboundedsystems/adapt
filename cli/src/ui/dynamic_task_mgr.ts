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

import { badTaskEvent, MessageClient, TaskEvent, TaskGroupOptions, TaskState } from "@adpt/utils";
import db from "debug";
import Listr, { ListrTask, ListrTaskWrapper } from "listr";
import pDefer from "p-defer";
import { CustomError } from "ts-custom-error";

const debug = db("cli:tasks");

export class DynamicTaskFailed extends CustomError { }

export interface DynamicTaskCommon {
    id: string;
    title: string;
    // Allow a task Created message with the same id to match to this root
    // task.
    adoptable?: boolean;
    // If task is a child group, allow the group to run when this many tasks
    // have been Created in the group. Minimum 1. Default=1.
    runOnChildTask?: number;
}

export interface DynamicTaskDef<Ret> extends DynamicTaskCommon {
    // Function to run to initiate the dynamic task. This function *should*
    // return a Promise, initiating async work. However, that Promise
    // will NOT be resolved by the dynamic task manager, effectively forking
    // control flow. Listr's standard control flow will call onCompleteRoot
    // as soon as the last subtask completes or when any subtask fails.
    // When initiate is used to call an Adapt API with TaskObserver,
    // onCompleteRoot will typically be called prior to the API Promise being
    // resolved, so onCompleteRoot can be used to check for errors from Listr
    // and wait on the API Promise to re-join control flow.
    initiate: (context: any, task: ListrTaskWrapper) => Promise<Ret>;

    // Called just before the root task is marked Completed (err===undefined)
    // or Failed (err!==undefined) and Listr control flow moves to the next task.
    // initiatePromise is the same Promise returned by the initiate function
    // and MUST be handled appropriately.
    // Throwing (or re-throwing) an exception from this function will result
    // in the root task becoming Failed, otherwise the task will be marked
    // Completed.
    onCompleteRoot: OnComplete<Ret>;
}

export type OnComplete<Ret> =
    (context: any, task: ListrTaskWrapper, err: any | undefined,
    initiatePromise: undefined | Promise<Ret>) => void | Promise<void>;

interface DynamicTaskInternal<Ret> extends DynamicTaskCommon {
    initiate?: (context: any, task: ListrTaskWrapper) => Promise<Ret>;
    onComplete?: OnComplete<Ret>;
}

export function addDynamicTask<Ret>(
    listr: Listr,    // The listr where this dynamic task will be added
    listrId: string, // The task ID that corresponds to this listr
    msgClient: MessageClient,
    taskDef: DynamicTaskDef<Ret>) {

    const { onCompleteRoot, ...rootTask } = taskDef;
    const registry = new TaskRegistry(listr, listrId);

    // Listen for all task events for all tasks in the task hierarchy under taskDef.id
    msgClient.task.on(`task:*:${taskDef.id}:**`, (event, status, from) => {
        debug(`Dynamic task event ${event} (${from}) ${status || ""}`);
        if (event === TaskEvent.Created) {
            createTask(registry, {
                id: from,
                title: status || "Unknown task name",
            });
        } else {
            updateTask(registry, from, event, status);
        }
    });

    createTask(registry, { onComplete: onCompleteRoot, ...rootTask });
}

interface ListrTaskStatus {
    id: string;
    event: TaskState;
    status: string | undefined;
    adoptable: boolean;
    task?: ListrTaskWrapper;
    childGroup?: Listr;
    dPromise: pDefer.DeferredPromise<void | Listr>;
    settled: boolean;
    childTasksNeeded: number;
}

function parent(id: string) {
    const lastColon = id.lastIndexOf(":");
    return lastColon > 0 ? id.slice(0, lastColon) : "";
}

function updateStoredEvent(
    taskStatus: ListrTaskStatus, event: TaskEvent | undefined): TaskEvent {
    switch (event) {
        case undefined:
            return taskStatus.event;
        case TaskEvent.ChildGroup:
        case TaskEvent.Status:
        case TaskEvent.Description:
            // Filter out TaskEvents that are not TaskStates
            break;
        default:
            taskStatus.event = event;
    }
    return event;
}

function updateStoredStatus(
    taskStatus: ListrTaskStatus, event: TaskEvent, status: string | undefined) {
    switch (event) {
        case TaskEvent.ChildGroup:
        case TaskEvent.Description:
        case TaskEvent.Complete:
            break;
        default:
            if (status == null) status = taskStatus.status;
            else taskStatus.status = status;
    }
    return status;
}

function updateTask(registry: TaskRegistry, id: string, event?: TaskEvent, status?: string) {
    const taskStatus = registry.get(id);
    if (!taskStatus) throw new Error(`Task ${id} got event ${event} but was never created`);

    const task = taskStatus.task;
    event = updateStoredEvent(taskStatus, event);
    status = updateStoredStatus(taskStatus, event, status);

    switch (event) {
        case TaskEvent.Complete:
            if (task && status) task.title = `${task.title} (${status})`;
            if (!taskStatus.settled) taskStatus.dPromise.resolve();
            break;
        case TaskEvent.Skipped:
            if (task) task.skip(status || "");
            if (!taskStatus.settled) taskStatus.dPromise.resolve();
            break;
        case TaskEvent.Failed:
            const err = new DynamicTaskFailed(status);
            if (!taskStatus.settled) taskStatus.dPromise.reject(err);
            else if (taskStatus.task) taskStatus.task.report(err);
            else throw new Error(`Internal error: dynamic task ${id} cannot report error ${err}`);
            break;
        case TaskEvent.Status:
            if (task) task.output = status;
            break;
        case TaskEvent.Description:
            if (task && status) task.title = status;
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
    set(id: string, tStatus: ListrTaskStatus) { this.tasks.set(id, tStatus); }

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

interface Holder<T> {
    value?: Promise<T>;
}

function createTask<Ret>(registry: TaskRegistry, taskDef: DynamicTaskInternal<Ret>) {
    const def = { ...createTaskDefaults, ...taskDef };
    const { id, title, initiate, adoptable, onComplete, runOnChildTask } = def;

    if (!Number.isInteger(runOnChildTask) || runOnChildTask < 1) {
        throw new Error(`createTask: runOnChildTask must be an integer >= 1`);
    }
    const tStatus = registry.get(id);

    if (tStatus) {
        if (!tStatus.adoptable) throw new Error(`Task ${id} has already been created`);
        return;
    } else {
        const newStatus = {
            id,
            event: TaskState.Created,
            status: undefined,
            adoptable,
            dPromise: pDefer<void | Listr>(),
            settled: false,
            childTasksNeeded: runOnChildTask,
        };

        // Record when the promise has been settled
        const settled = () => newStatus.settled = true;
        newStatus.dPromise.promise.then(settled, settled);

        registry.set(id, newStatus);
    }

    const returnHolder: Holder<Ret> = {};

    const listrTask: ListrTask = {
        title,
        task: async (ctx, task) => {
            const cur = registry.get(id);
            if (!cur) throw new Error(`Cannot find task ${id}`);
            if (cur.task) throw new Error(`Task ${id} already has a task object`);
            cur.task = task;
            updateTask(registry, id);

            if (initiate) {
                returnHolder.value = initiate(ctx, task).catch((err) => {
                    cur.dPromise.reject(err);
                    throw err;
                });
            }
            return cur.dPromise.promise;
        },
    };

    listrTask.onComplete = async (ctx, task, err) => {
        if (onComplete) return onComplete(ctx, task, err, returnHolder.value);
        if (err) throw err;
        if (returnHolder.value) await returnHolder.value;
    };

    registry.getParentListr(id).add(listrTask);

    // Allow the task group to run once there's a task in the group
    const parentStat = registry.getParent(id);
    if (parentStat && parentStat.childGroup && parentStat.childTasksNeeded > 0) {
        if (--parentStat.childTasksNeeded === 0) {
            parentStat.dPromise.resolve(parentStat.childGroup);
        }
    }
}

export function waitForInitiate<Ret>(err: any | undefined,
    initiatePromise: Promise<Ret> | undefined) {

    // Ignore errors generated by dynamic task failed messages, but allow
    // others through.
    if (err && !(err instanceof DynamicTaskFailed)) {
        throw err;
    }
    if (initiatePromise === undefined) {
        // This happens if the initiate function throws, but then err should
        // have been set...?
        throw new Error(`Internal error: initiatePromise is null`);
    }

    return initiatePromise;
}
