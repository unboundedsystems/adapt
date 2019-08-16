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
import {
    listDeployments as listDeploymentsInner,
} from "../server/deployment";
import { ApiResponse, WithLogger, withOpsSetup } from "./common";
//import { forkExports } from "./fork";

export interface DeploymentInfo {
    deployID: string;
}

export interface ListOptions extends WithLogger {
    adaptUrl: string;
}

export interface ListResponse extends ApiResponse {
    type: "success";
    deployments: DeploymentInfo[];
}

export async function listDeployments(options: ListOptions): Promise<ListResponse> {
    const setup = {
        name: "listDeployments",
        description: "Listing deployments",
        ...options,
    };
    return withOpsSetup(setup, async (info): Promise<ListResponse> => {
        const { logger } = info;
        const server = await adaptServer(options.adaptUrl, {});
        return {
            type: "success",
            deployments: await listDeploymentsInner(server),
            messages: logger.messages,
            summary: logger.summary,
        };
    });
}

//FIXME(manishv) Adding this causes a straggling listener which means processes never exit
//forkExports(module, "listDeployments");
