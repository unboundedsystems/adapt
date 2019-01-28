import { dirname } from "path";
import { DeployOpBase } from "../../base/deploy_base";
import { projectAdaptModule } from "../../proj";
import { AdaptModule, ApiResponse } from "../../types/adapt_shared";
import { addDynamicTask } from "../../ui/dynamic_task_mgr";
import { UpdateBaseCommand } from "./update";

export default class DestroyCommand extends UpdateBaseCommand {
    static description = "Stop an existing deployment of an Adapt project";

    static examples = [
        `
Stop the deployment "myproj-dev-abcd" using the default project description file, "index.tsx":
    $ adapt deploy:stop myproj-dev-abcd`,
    ];

    static flags = {
        ...DeployOpBase.flags,
    };

    static args = [
        {
            name: "deployID",
            required: true,
        }
    ];

    ingverb = "stopping";
    edverb = "stopped";

    async run() {
        this.ctx.stackName = "(null)";
        await this.addUpdateTask();

        let resultP: Promise<ApiResponse>;

        const logger = this.ctx.logger.createChild("destroy");
        const loggerId = logger.from;

        addDynamicTask(this.tasks, this.ctx.logger.from, this.ctx.client, {
            id: loggerId,
            title: "Destroying deployment",
            adoptable: true,
            initiate: async (_ctx, task) => {
                let adapt: AdaptModule | undefined;
                if (this.ctx.projectFile !== undefined) {
                    try {
                        adapt = await projectAdaptModule(dirname(this.ctx.projectFile));
                    } catch (e) {
                        task.title = "Destroying deployment (using internal adapt)";
                        task.report(e);
                    }
                }
                if (adapt === undefined) adapt = require("@usys/adapt");
                if (adapt === undefined) throw new Error("Internal Error: adapt is undefined");

                resultP = adapt.destroyDeployment({
                    adaptUrl: this.ctx.adaptUrl,
                    client: this.ctx.client,
                    deployID: this.args.deployID,
                    dryRun: this.ctx.dryRun,
                    debug: this.ctx.debug,
                    logger,
                    loggerId,
                }).catch((err) => {
                    task.fail(err);
                    throw err;
                });
            }
        });

        this.tasks.add({
            title: "Checking results",
            task: async () => {
                const result = await resultP;
                this.handleApiResponse(result, { action: "destroy" });
            }
        });

        await this.tasks.run();
    }
}
