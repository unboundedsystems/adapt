/*
 * Copyright 2018-2019 Unbounded Systems, LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { ListrTaskWrapper } from "@unboundedsystems/listr";
import { dirname } from "path";
import { DeployOpBase } from "../../base/deploy_base";
import { projectAdaptModule } from "../../proj";
import { AdaptModule } from "../../types/adapt_shared";
import { addDynamicTask, waitForInitiate } from "../../ui/dynamic_task_mgr";
import { UpdateBaseCommand } from "./update";

export default class DestroyCommand extends UpdateBaseCommand {
    static description = "Destroy an existing deployment of an Adapt project";

    static aliases = [ "destroy" ];

    static examples = [
        `
Destroy the deployment "myproj-dev-abcd" using the default project description file, "index.tsx":
    $ adapt deploy:destroy myproj-dev-abcd`,
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
        this.addUpdateTask();

        const logger = this.ctx.logger.createChild("destroy");
        const loggerId = logger.from;

        // NOTE: This function isn't defined in the object literal passed
        // to addDynamicTask because TS 3.0.3 can't seem to get the template
        // type correct if defined there.
        const initiate = async (_ctx: any, task: ListrTaskWrapper) => {
            let adapt: AdaptModule | undefined;
            if (this.ctx.projectFile !== undefined) {
                try {
                    adapt = await projectAdaptModule(dirname(this.ctx.projectFile));
                } catch (e) {
                    task.title = "Destroying deployment (using internal adapt)";
                    task.report(e);
                }
            }
            if (adapt === undefined) adapt = require("@adpt/core");
            if (adapt === undefined) throw new Error("Internal Error: adapt is undefined");

            return adapt.destroyDeployment({
                adaptUrl: this.ctx.adaptUrl,
                client: this.ctx.client,
                deployID: this.args.deployID,
                dryRun: this.ctx.dryRun,
                debug: this.ctx.debug,
                logger,
                loggerId,
            });
        };

        addDynamicTask(this.tasks, this.ctx.logger.from, this.ctx.client, {
            id: loggerId,
            title: "Destroying deployment",
            adoptable: true,
            initiate,
            onCompleteRoot: async (_ctx, _task, err, prom) => {
                const response = await waitForInitiate(err, prom);
                this.handleApiResponse(response, { action: "destroy" });
            }
        });

        await this.tasks.run();
    }
}
