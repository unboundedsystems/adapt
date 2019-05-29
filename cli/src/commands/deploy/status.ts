import { DeployOpBase } from "../../base";
import { StatusOptions } from "../../types/adapt_shared";
import { addDynamicTask, waitForInitiate } from "../../ui/dynamic_task_mgr";

export default class StatusCommand extends DeployOpBase {
    static description = "Fetch the status of an existing deployment of an Adapt project";

    static aliases = [ "status" ];

    static examples = [
`Fetch the status of deployment "myproj-dev-abcd" from the default project ` +
`description file, "index.tsx":
    $ adapt deploy:status myproj-dev-abcd\n`,
`Fetch the status of deployment "myproj-dev-abcd" from an alternate ` +
`description file, "somefile.tsx":
    $ adapt deploy:status --rootFile somefile.tsx myproj-dev-abcd`,
    ];

    static flags = {
        ...DeployOpBase.flags,
    };

    static args = [
        {
            name: "deployID",
            required: true,
        },
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

        const logger = ctx.logger.createChild("status");
        const loggerId = logger.from;

        addDynamicTask(this.tasks, ctx.logger.from, ctx.client, {
            id: loggerId,
            title: "Fetching status for project deployment",
            adoptable: true,
            initiate: () => {
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
                };

                return ctx.project.status(statusOptions);
            },
            onCompleteRoot: async (_ctx, _task, err, prom) => {
                const deployState = await waitForInitiate(err, prom);
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
