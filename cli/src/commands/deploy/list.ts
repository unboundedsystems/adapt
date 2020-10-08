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

import { dirname } from "path";
import * as util from "util";
import { defaultServerUrl, DeployBase } from "../../base";
import { projectAdaptModule } from "../../proj";
import { AdaptModule, DeploymentInfo } from "../../types/adapt_shared";
import { addDynamicTask, waitForInitiate } from "../../ui/dynamic_task_mgr";

function formatDeployments(info: DeploymentInfo[]) {
    return info.map((i) => i.deployID).join("\n");
}

function getErrorMsg(e: any) {
    if ("message" in e) return e.message;
    return util.inspect(e);
}

export default class ListCommand extends DeployBase {
    static description = "List active Adapt deployments";

    static aliases = [ "list" ];

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
                    this.adapt = require("@adpt/core");
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
                    this.adapt = require("@adpt/core");
                }
            }
        });

        const logger = ctx.logger.createChild("list");
        const loggerId = logger.from;

        addDynamicTask(this.tasks, ctx.logger.from, ctx.client, {
            id: loggerId,
            title: "Listing Deployments",
            adoptable: true,
            initiate: () => this.adapt.listDeployments({
                adaptUrl: ctx.adaptUrl,
                client: ctx.client,
                logger,
                loggerId,
            }),
            onCompleteRoot: async (_ctx, _task, err, prom) => {
                const info = await waitForInitiate(err, prom);
                if (err && err.message) {
                    const m = err.message.match(/Invalid Adapt Server URL '(.*?)'.*does not exist/);
                    const url = m && m[1];
                    if (url === defaultServerUrl(this.config)) {
                        this.appendOutput(formatDeployments([]));
                        return;
                    }
                }
                if (!this.isApiSuccess(info, { action: "list" })) return;
                this.appendOutput(formatDeployments(info.deployments));
            }
        });

        await this.tasks.run();
    }

}
