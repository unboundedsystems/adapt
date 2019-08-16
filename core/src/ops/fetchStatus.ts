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

import { InternalError } from "../error";
import { ObserversThatNeedData } from "../observers";
import { adaptServer } from "../server";
import { loadDeployment } from "../server/deployment";
import { build, BuildResults, currentState, withContext } from "./buildAndDeploy";
import {
    defaultDeployCommonOptions,
    DeployCommonOptions,
    DeployState,
    withOpsSetup,
} from "./common";
import { forkExports } from "./fork";

export interface StatusOptions extends DeployCommonOptions {
    deployID: string;
}

const defaultOptions = {
};

export async function fetchStatus(options: StatusOptions): Promise<DeployState> {
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
        name: "fetchStatus",
        description: "Fetching deployment status",
        client,
        logger: _logger,
        loggerId,
    };
    return withOpsSetup(setup, async (info): Promise<DeployState> => {
        const { logger, taskObserver } = info;
        try {
            const tasks = taskObserver.childGroup().add({
                load: "Getting deployment information",
                compile: "Compiling project",
                status: "Querying status",
            });

            const currState = await tasks.load.complete(async () => {
                const server = await adaptServer(adaptUrl, {});
                const deployment = await loadDeployment(server, deployID);
                return currentState({
                    deployment,
                    taskObserver,
                    ...buildOpts
                });
            });

            let result: BuildResults | undefined;
            let needsData: ObserversThatNeedData | undefined;
            await withContext(currState, async (ctx) => {
                result = await tasks.status.complete(() => build({
                    ...currState,
                    taskObserver,
                    ctx,
                    withStatus: true
                }));

                const inAdapt = ctx.Adapt;
                needsData = inAdapt.internal.simplifyNeedsData(result.needsData);
            });

            if (result === undefined) throw new InternalError("result undefined, should be unreachable");
            if (needsData === undefined) throw new InternalError("needsData undefined, should be unreachable");

            return {
                type: "success",
                messages: logger.messages,
                summary: logger.summary,

                domXml: result.domXml,
                stateJson: result.prevStateJson,
                deployID: options.deployID,
                needsData,
                mountedOrigStatus: result.mountedOrigStatus,
            };
        } catch (err) {
            logger.error(`Error fetching deployment status: ${err}`);
            return {
                type: "error",
                messages: logger.messages,
                summary: logger.summary,
                domXml: err.domXml,
            };
        }
    });
}

forkExports(module, "fetchStatus");
