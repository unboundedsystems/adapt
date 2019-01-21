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

    const setup = {
        name: "updateDeployment",
        description: "Updating deployment",
        logger: _logger,
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
