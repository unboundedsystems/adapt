import { flags } from "@oclif/command";
import { badTaskEvent, MessageStreamClient, TaskEvent, TaskGroupOptions, TaskState } from "@usys/utils";
import Listr from "listr";
import pDefer from "p-defer";

import { cantDeploy, DeployOpBase } from "../../base";
import { UserError } from "../../error";
import { CreateOptions, DeployState } from "../../types/adapt_shared";

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
            if (task) task.output = "Waiting";
            break;
        case TaskEvent.Started:
            if (task) task.output = event;
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

interface RemoteTaskDef {
    id: string;
    title: string;
    initiate?: () => any | Promise<any>;
    adoptable?: boolean;
}

function createTask(registry: TaskRegistry, taskDef: RemoteTaskDef) {
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
        task: (_ctx, task) => {
            const cur = registry.get(id);
            if (!cur) throw new Error(`Cannot find task ${id}`);
            if (cur.task) throw new Error(`Task ${id} already has a task object`);
            cur.task = task;
            updateTask(registry, id);

            if (initiate) {
                const ret = initiate();
                return Promise.resolve(ret)
                    .then(() => {
                        console.log(`returning promise`);
                        return cur.dPromise.promise;
                    });
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

export default class CreateCommand extends DeployOpBase {
    static description = "Create a new deployment for an Adapt project";

    static examples = [
`Deploy the stack named "dev" from the default project description file, index.tsx:
    $ adapt deploy:create dev`,
`Deploy the stack named "dev" from an alternate description file:
    $ adapt deploy:create --rootFile somefile.tsx dev`,
    ];

    static flags = {
        ...DeployOpBase.flags,
        init: flags.boolean({
            description: "Initialize a new local deployment server if it doesn't exist",
        }),
    };

    static args = [
        {
            name: "stackName",
            required: true,
        },
    ];

    async run() {
        // NOTE(mark): Why doesn't oclif set the boolean flags to false?
        if (this.flags.init === undefined) this.flags.init = false;

        const ctx = this.ctx;
        if (ctx == null) {
            throw new Error(`Internal error: ctx cannot be null`);
        }

        const registry = new TaskRegistry(this.tasks);
        /*
        const setupDone = pDefer<void>();
        const subtasks = new Listr({ concurrent: false });

        const taskStatuses = new Map<string, ListrTaskStatus>();
        */

        const logger = new MessageStreamClient({
            outStream: process.stdout,
            errStream: process.stderr,
        });
        logger.task.on("task:**", (event, status, from) => {
            if (event === TaskEvent.Created) {
                createTask(registry, {
                    id: from,
                    title: status || "Unknown task name",
                });
            } else {
                updateTask(registry, from, event, status);
            }
        });

        let deployStateP: Promise<DeployState>;

        createTask(registry, {
            id: "main",
            title: "Creating new project deployment",
            adoptable: true,
            initiate: () => {
                if (ctx.project == null) throw new Error(`Internal error: project cannot be null`);

                const createOptions: CreateOptions = {
                    adaptUrl: ctx.adaptUrl,
                    debug: ctx.debug,
                    dryRun: ctx.dryRun,
                    fileName: ctx.projectFile,
                    logger,
                    projectName: ctx.project.name,
                    stackName: ctx.stackName,
                    initLocalServer: this.flags.init,
                };
                deployStateP = ctx.project.create(createOptions)
                    .catch((err) => {
                        if (err.message.match(/No plugins registered/)) {
                            this.error(cantDeploy +
                                `The project did not import any Adapt plugins`);
                        }
                        if (err instanceof UserError) this.error(err.message);
                        throw err;
                    });
            }
        });

        this.tasks.add({
            title: "Finishing up",
            task: async () => {
                const deployState = await deployStateP;
                if (!this.isDeploySuccess(deployState)) return;
                this.deployInformation(deployState);

                const id = deployState.deployID;

                this.appendOutput(`Deployment created successfully. DeployID is: ${id}`);
            }
        });

        await this.tasks.run();
    }

}
