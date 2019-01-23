import { cantDeploy, DeployOpBase } from "../../base";
import { UserError } from "../../error";
import { DeployState, UpdateOptions } from "../../types/adapt_shared";
import { addDynamicTask } from "../../ui/dynamic_task_mgr";

function cap(s: string): string {
    return s.substr(0, 1).toUpperCase() + s.substr(1);
}

export abstract class UpdateBaseCommand extends DeployOpBase {
    ingverb: string = "updating";
    edverb: string = "updated";

    async addUpdateTask() {
        const deployID: string | undefined = this.args.deployID;
        if (deployID == null) {
            throw new Error(`Internal error: deployID cannot be null`);
        }

        const ctx = this.ctx;
        if (ctx == null) {
            throw new Error(`Internal error: ctx cannot be null`);
        }

        let deployStateP: Promise<DeployState>;

        const loggerId = `${ctx.logger.from}:update`;

        addDynamicTask(this.tasks, ctx.logger.from, ctx.client, {
            id: loggerId,
            title: `${cap(this.ingverb)} project deployment`,
            adoptable: true,
            initiate: () => {
                if (ctx.project == null) {
                    throw new Error(`Internal error: project cannot be null`);
                }

                const updateOptions: UpdateOptions = {
                    adaptUrl: ctx.adaptUrl,
                    debug: ctx.debug,
                    deployID,
                    client: ctx.client,
                    dryRun: ctx.dryRun,
                    fileName: ctx.projectFile,
                    logger: ctx.logger,
                    loggerId,
                    stackName: ctx.stackName,
                };
                deployStateP = ctx.project.update(updateOptions)
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

                this.appendOutput(`Deployment ${id} ${this.edverb} successfully.`);
            }
        });
    }
}

export default class UpdateCommand extends UpdateBaseCommand {
    static description = "Update an existing deployment of an Adapt project";

    static examples = [
        `
Update the deployment "myproj-dev-abcd", using the stack named "dev" from
the default project description file, "index.tsx":
    $ adapt deploy:update myproj-dev-abcd dev

Update the deployment "myproj-dev-abcd", using the stack named "dev" from
an alternate description file, "somefile.tsx":
    $ adapt deploy:update --rootFile somefile.tsx myproj-dev-abcd dev`,
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
        },
    ];

    ingverb = "updating";
    edverb = "updated";

    async run() {
        await this.addUpdateTask();
        await this.tasks.run();
    }
}
