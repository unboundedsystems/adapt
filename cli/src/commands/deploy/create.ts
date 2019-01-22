import { flags } from "@oclif/command";
import { badTaskEvent, MessageStreamClient, TaskEvent } from "@usys/utils";
import Listr from "listr";
import pDefer from "p-defer";

import { cantDeploy, DeployOpBase } from "../../base";
import { UserError } from "../../error";
import { CreateOptions, DeployState } from "../../types/adapt_shared";

interface TaskStatus {
    event: TaskEvent;
    status: string | undefined;
    task?: Listr.ListrTaskWrapper;
    dPromise: pDefer.DeferredPromise<void>;
}

function updateTask(taskStatus: TaskStatus, event?: TaskEvent, status?: string) {
    const task = taskStatus.task;

    if (event == null) event = taskStatus.event;
    else taskStatus.event = event;

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
        default: return badTaskEvent(event);
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

        const setupDone = pDefer<void>();
        const subtasks = new Listr({ concurrent: false });

        const taskStatuses = new Map<string, TaskStatus>();

        const logger = new MessageStreamClient({
            outStream: process.stdout,
            errStream: process.stderr,
        });
        logger.task.on("task:**", (event, status, from) => {
            let tStatus = taskStatuses.get(from);

            if (event === TaskEvent.Created) {
                if (tStatus) throw new Error(`Task ${from} has already been created`);
                tStatus = { event, status, dPromise: pDefer() };
                taskStatuses.set(from, tStatus);
                subtasks.add({
                    title: status || "Unknown",
                    task: (_ctx, task) => {
                        const cur = taskStatuses.get(from);
                        if (!cur) throw new Error(`Cannot find task ${from}`);
                        if (cur.task) throw new Error(`Task ${from} already has a task object`);
                        cur.task = task;
                        updateTask(cur);
                        return cur.dPromise.promise;
                    }
                });
                // The setup task is complete when the first additional task
                // has been added.
                setupDone.resolve();
                return;
            }
            if (!tStatus) throw new Error(`Task ${from} got event ${event} but was never created`);
            updateTask(tStatus, event, status);
        });

        let deployStateP: Promise<DeployState>;

        this.tasks.add({
            title: "Creating new project deployment",
            task: () => subtasks,
        });

        subtasks.add({
            title: "Setting up",
            task: () => {
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
                return setupDone.promise;
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
