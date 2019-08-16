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
import { destroyDeployment as serverDestroyDeployment } from "../server/deployment";
import {
    ApiResponse,
    defaultDeployCommonOptions,
    WithLogger,
    withOpsSetup,
} from "./common";
//import { forkExports } from "./fork";

export interface DestroyOptions extends WithLogger {
    adaptUrl: string;
    deployID: string;
    debug?: string;
    dryRun?: boolean;
}

export async function destroyDeployment(optionsIn: DestroyOptions): Promise<ApiResponse> {
    const options = {
        ...defaultDeployCommonOptions,
        ...optionsIn
    };

    const setup = {
        name: "destroyDeployment",
        description: "Destroying deployment",
        client: options.client,
        logger: options.logger,
        loggerId: options.loggerId,
    };
    return withOpsSetup(setup, async (info) => {
        const { adaptUrl, deployID, } = options;

        const server = await adaptServer(adaptUrl, {});
        if (!options.dryRun) {
            await serverDestroyDeployment(server, deployID);
        }
        return {
            type: "success",
            messages: info.logger.messages,
            summary: info.logger.summary,
        };
    });
}

//FIXME(manishv) Adding this causes a destroyDeployment to never return
//forkExports(module, "destroyDeployment");
