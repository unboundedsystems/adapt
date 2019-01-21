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
        logger: options.logger,
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
