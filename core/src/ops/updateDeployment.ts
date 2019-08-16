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

import { adaptServer } from "../server";
import { loadDeployment } from "../server/deployment";
import { buildAndDeploy } from "./buildAndDeploy";
import {
    defaultDeployCommonOptions,
    DeployCommonOptions,
    DeployState,
    withOpsSetup,
} from "./common";
import { forkExports } from "./fork";

export interface UpdateOptions extends DeployCommonOptions {
    deployID: string;
    prevStateJson?: string;
    observationsJson?: string;
    stackName?: string;
}

const defaultOptions = {
};

export async function updateDeployment(options: UpdateOptions): Promise<DeployState> {
    const finalOptions = {
        ...defaultDeployCommonOptions,
        ...defaultOptions,
        ...options
    };
    const {
        adaptUrl,
        client,
        deployID,
        logger: _logger,
        loggerId,
        ...buildOpts
    } = finalOptions;

    const setup = {
        name: "updateDeployment",
        description: "Updating deployment",
        client,
        logger: _logger,
        loggerId,
    };
    return withOpsSetup(setup, async (info): Promise<DeployState> => {
        const { taskObserver } = info;
        const server = await adaptServer(adaptUrl, {});
        const deployment = await loadDeployment(server, deployID);

        return buildAndDeploy({
            deployment,
            taskObserver,
            ...buildOpts,
        });
    });
}

forkExports(module, "updateDeployment");
