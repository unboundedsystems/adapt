import { dirname } from "path";
import { isError } from "util";
import { DeployOpBase } from "../../base/deploy_base";
import { projectAdaptModule } from "../../proj";
import { AdaptModule } from "../../types/adapt_shared";
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
        this.tasks.add({
            title: "Destroying deployment",
            task: async (_ctx, task) => {
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

                const result = await adapt.destroyDeployment({
                    adaptUrl: this.ctx.adaptUrl,
                    deployID: this.args.deployID,
                    dryRun: this.ctx.dryRun,
                    debug: this.ctx.debug
                });

                if (isError(result)) throw result;
            }
        });
        await this.tasks.run();
    }
}
