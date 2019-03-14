import { DeployOpBase } from "../../base";
import { CreateOptions } from "../../types/adapt_shared";
import { addDynamicTask, waitForInitiate } from "../../ui/dynamic_task_mgr";

export default class CreateCommand extends DeployOpBase {
    static description = "Create a new deployment for an Adapt project";

    static examples = [
`Deploy the stack named "dev" from the default project description file, index.tsx:
    $ adapt deploy:create dev`,
`Deploy the stack named "dev" from an alternate description file:
    $ adapt deploy:create --rootFile somefile.tsx dev`,
    ];

    static flags = DeployOpBase.flags;

    static args = [
        {
            name: "stackName",
            required: true,
        },
    ];

    async run() {
        const ctx = this.ctx;
        if (ctx == null) {
            throw new Error(`Internal error: ctx cannot be null`);
        }

        const logger = ctx.logger.createChild("create");
        const loggerId = logger.from;

        addDynamicTask(this.tasks, ctx.logger.from, ctx.client, {
            id: loggerId,
            title: "Creating new project deployment",
            adoptable: true,
            initiate: () => {
                if (ctx.project == null) throw new Error(`Internal error: project cannot be null`);

                const createOptions: CreateOptions = {
                    adaptUrl: ctx.adaptUrl,
                    debug: ctx.debug,
                    dryRun: ctx.dryRun,
                    client: ctx.client,
                    fileName: ctx.projectFile,
                    logger,
                    loggerId,
                    projectName: ctx.project.name,
                    stackName: ctx.stackName,
                    initLocalServer: true,
                };

                return ctx.project.create(createOptions);
            },
            onCompleteRoot: async (_ctx, _task, err, prom) => {
                const deployState = await waitForInitiate(err, prom);
                const id = deployState.deployID;
                const errorEnding =
                    ctx.dryRun ?
                        `\nDeployment would not have been created due to errors` :
                    id ?
                        `\nDeployment created but errors occurred in the deploy phase.\n` +
                        `DeployID is: ${id}` :
                    `\nDeployment not created due to errors`;

                if (!this.isDeploySuccess(deployState, { errorEnding })) return;

                this.deployInformation(deployState);
                this.appendOutput(`Deployment created successfully. DeployID is: ${id}`);
            }
        });

        await this.tasks.run();
    }
}
