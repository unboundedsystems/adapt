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
