import * as ld from "lodash";
import { dirname } from "path";
import * as util from "util";
import { DeployBase } from "../../base";
import { projectAdaptModule } from "../../proj/index";
import { AdaptModule, DeploymentInfo } from "../../types/adapt_shared";

function formatDeployments(info: DeploymentInfo[]) {
    return info.map((i) => i.deployID).join("\n");
}

function getErrorMsg(e: any) {
    if ("message" in e) return e.message;
    return util.inspect(e);
}

export default class ListCommand extends DeployBase {
    static description = "Create a new deployment for an Adapt project";

    static examples = [
        `List all deployments from the server
    $ adapt deploy:list`,
    ];

    static flags = {
        ...DeployBase.flags
    };

    static args = [];

    adapt: AdaptModule;

    async run() {
        const ctx = this.ctx;
        if (ctx == null) {
            throw new Error(`Internal error: ctx cannot be null`);
        }

        this.adapt = require("@usys/adapt");

        this.tasks.add([{
            title: "Checking for project-level adapt module",
            skip: () => {
                if (this.ctx.projectFile === undefined) {
                    return "Project root file not found, using internal adapt module";
                }
            },
            task: async (_ctx, task) => {
                if (this.ctx.projectFile === undefined) {
                    throw new Error(`Internal error: projectFile should not be undefined`);
                }
                try {
                    this.adapt = await projectAdaptModule(dirname(this.ctx.projectFile));
                } catch (e) {
                    const msg = getErrorMsg(e);
                    task.skip(`${msg}, using internal adapt module`);
                }
            }
        },
        {
            title: "Listing Deployments",
            task: async () => {
                const info = await this.adapt.listDeployments({ adaptUrl: ctx.adaptUrl });
                if (ld.isError(info)) {
                    throw info;
                }
                this.appendOutput(formatDeployments(info));
            }
        }]);

        await this.tasks.run();
    }

}
