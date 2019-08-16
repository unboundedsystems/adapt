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

import { DeployOpBase } from "../../base";
import { UpdateOptions } from "../../types/adapt_shared";
import { addDynamicTask, waitForInitiate } from "../../ui/dynamic_task_mgr";

function cap(s: string): string {
    return s.substr(0, 1).toUpperCase() + s.substr(1);
}

export abstract class UpdateBaseCommand extends DeployOpBase {
    ingverb: string = "updating";
    edverb: string = "updated";

    addUpdateTask() {
        const deployID: string | undefined = this.args.deployID;
        if (deployID == null) {
            throw new Error(`Internal error: deployID cannot be null`);
        }

        const ctx = this.ctx;
        if (ctx == null) {
            throw new Error(`Internal error: ctx cannot be null`);
        }

        const logger = ctx.logger.createChild("update");
        const loggerId = logger.from;

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
                    logger,
                    loggerId,
                    stackName: ctx.stackName,
                };

                return ctx.project.update(updateOptions);
            },
            onCompleteRoot: async (_ctx, _task, err, prom) => {
                const deployState = await waitForInitiate(err, prom);
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

    static aliases = [ "update" ];

    static examples = [
`Update the deployment "myproj-dev-abcd", from the default project ` +
`description file, "index.tsx":
    $ adapt deploy:update myproj-dev-abcd\n`,
`Update the deployment "myproj-dev-abcd", using the stack named "dev" from ` +
`an alternate description file, "somefile.tsx":
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
        },
    ];

    ingverb = "updating";
    edverb = "updated";

    async run() {
        this.addUpdateTask();
        await this.tasks.run();
    }
}
