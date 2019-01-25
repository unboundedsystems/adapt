import { dirname } from "path";
import * as util from "util";
import { DeployBase } from "../../base";
import { projectAdaptModule } from "../../proj";
import { AdaptModule, DeploymentInfo, ListResponse } from "../../types/adapt_shared";
import { addDynamicTask } from "../../ui/dynamic_task_mgr";

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

        this.tasks.add({
            title: "Checking for project-level adapt module",
            skip: () => {
                if (this.ctx.projectFile === undefined) {
                    this.adapt = require("@usys/adapt");
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
                    this.adapt = require("@usys/adapt");
                }
            }
        });

        let infoP: Promise<ListResponse>;

        const logger = ctx.logger.createChild("list");
        const loggerId = logger.from;

        addDynamicTask(this.tasks, ctx.logger.from, ctx.client, {
            id: loggerId,
            title: "Listing Deployments",
            adoptable: true,
            initiate: (_ctx, task) => {
                infoP = this.adapt.listDeployments({
                    adaptUrl: ctx.adaptUrl,
                    client: ctx.client,
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
                const info = await infoP;
                if (!this.isApiSuccess(info, { action: "list" })) return;
                this.appendOutput(formatDeployments(info.deployments));
            }
        });

        await this.tasks.run();
    }

}
