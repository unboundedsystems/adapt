import { adaptServer } from "../server";
import { loadDeployment } from "../server/deployment";
import { buildAndDeploy } from "./buildAndDeploy";
import {
    defaultDeployCommonOptions,
    DeployCommonOptions,
    DeployState
} from "./common";

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
    const { adaptUrl, deployID, ...buildOpts } = finalOptions;

    try {
        const server = await adaptServer(adaptUrl, {});
        const deployment = await loadDeployment(server, deployID);

        return buildAndDeploy({
            deployment,
            ...buildOpts,
        });

    } catch (err) {
        finalOptions.logger.error(`Error updating deployment: ${err}`);
        return {
            type: "error",
            messages: finalOptions.logger.messages,
            summary: finalOptions.logger.summary,
            domXml: err.domXml,
        };
    }
}
