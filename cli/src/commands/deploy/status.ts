import { DeployOpBase } from "../../base";
import { UserError } from "../../error";
import { DeployState, StatusOptions } from "../../types/adapt_shared";
import { addDynamicTask } from "../../ui/dynamic_task_mgr";

export default class StatusCommand extends DeployOpBase {
    static description = "Fetch the status of an existing deployment of an Adapt project";

    static examples = [
`
Fetch the status of deployment "myproj-dev-abcd", for the stack named "dev" from
the default project description file, "index.tsx":
    $ adapt deploy:status myproj-dev-abcd dev

Fetch the status of deployment "myproj-dev-abcd", for the stack named "dev" from
an alternate description file, "somefile.tsx":
    $ adapt deploy:status --rootFile somefile.tsx myproj-dev-abcd dev`,
    ];

    static flags = {
        ...DeployOpBase.flags,
    };

    static args = [
        {
            name: "deployID",
            required: true,
        },
        {
            name: "stackName",
            required: true,
        }
    ];

    async run() {
        const deployID: string | undefined = this.args.deployID;
        if (deployID == null) {
            throw new Error(`Internal error: deployID cannot be null`);
        }

        const ctx = this.ctx;
        if (ctx == null) {
            throw new Error(`Internal error: ctx cannot be null`);
        }

        let deployStateP: Promise<DeployState>;

        const logger = ctx.logger.createChild("status");
        const loggerId = logger.from;

        addDynamicTask(this.tasks, ctx.logger.from, ctx.client, {
            id: loggerId,
            title: "Fetching status for project deployment",
            adoptable: true,
            initiate: (_ctx, task) => {
                if (ctx.project == null) {
                    throw new Error(`Internal error: project cannot be null`);
                }

                const statusOptions: StatusOptions = {
                    adaptUrl: ctx.adaptUrl,
                    client: ctx.client,
                    deployID,
                    dryRun: ctx.dryRun,
                    fileName: ctx.projectFile,
                    logger,
                    loggerId,
                    stackName: ctx.stackName,
                };
                deployStateP = ctx.project.status(statusOptions)
                    .catch((err) => {
                        if (err instanceof UserError) this.error(err.message);
                        throw err;
                    })
                    .catch((err) => {
                        task.fail(err);
                        throw err;
                    });
            }
        });

        this.tasks.add({
            title: "Checking results",
            task: async () => {
                const deployState = await deployStateP;
                if (!this.isApiSuccess(deployState, { action: "fetching status" })) return;

                this.deployInformation(deployState);

                const id = deployState.deployID;

                this.appendOutput(`Deployment ${id} status:`);
                this.appendOutput(JSON.stringify(deployState.mountedOrigStatus, null, 2));
            }
        });

        await this.tasks.run();
    }
}
