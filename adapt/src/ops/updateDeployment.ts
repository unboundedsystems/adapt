import { adaptServer } from "../server";
import { loadDeployment } from "../server/deployment";
import { buildAndDeploy } from "./buildAndDeploy";
import {
    defaultDeployCommonOptions,
    DeployCommonOptions,
    DeployState,
    setupLogger,
} from "./common";
import { forkExports } from "./fork";

export interface UpdateOptions extends DeployCommonOptions {
    deployID: string;
    prevStateJson?: string;
    observationsJson?: string;
}

const defaultOptions = {
};

export async function updateDeployment(options: UpdateOptions): Promise<DeployState> {
    const finalOptions = {
        ...defaultDeployCommonOptions,
        ...defaultOptions,
        ...options
    };
    const { adaptUrl, deployID, logger: _logger, ...buildOpts } = finalOptions;

    const logger = await setupLogger(_logger);

    try {
        const server = await adaptServer(adaptUrl, {});
        const deployment = await loadDeployment(server, deployID);

        return buildAndDeploy({
            deployment,
            logger,
            ...buildOpts,
        });

    } catch (err) {
        logger.error(`Error updating deployment: ${err}`);
        return {
            type: "error",
            messages: logger.messages,
            summary: logger.summary,
            domXml: err.domXml,
        };
    }
}

forkExports(module, "updateDeployment");
