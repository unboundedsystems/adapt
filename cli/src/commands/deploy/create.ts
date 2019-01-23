import { flags } from "@oclif/command";

import { cantDeploy, DeployOpBase } from "../../base";
import { UserError } from "../../error";
import { CreateOptions, DeployState } from "../../types/adapt_shared";
import { addDynamicTask } from "../../ui/dynamic_task_mgr";

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

        let deployStateP: Promise<DeployState>;

        const loggerId = `${ctx.logger.from}:create`;

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
                    logger: ctx.logger,
                    loggerId,
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
            title: "Checking results",
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
