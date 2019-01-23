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
