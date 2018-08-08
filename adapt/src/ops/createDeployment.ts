import { adaptServer } from "../server";
import { createDeployment as createDep, destroyDeployment } from "../server/deployment";
import { buildAndDeploy } from "./buildAndDeploy";
import {
    defaultDeployCommonOptions,
    DeployCommonOptions,
    DeployState
} from "./common";

export interface CreateOptions extends DeployCommonOptions {
    projectName: string;

    initLocalServer?: boolean;
    initialStateJson?: string;
}

const defaultOptions = {
    initLocalServer: false,
    initialStateJson: "{}",
};

export async function createDeployment(options: CreateOptions): Promise<DeployState> {
    const finalOptions = {
        ...defaultDeployCommonOptions,
        ...defaultOptions,
        ...options
    };
    const {
        adaptUrl, initLocalServer, initialStateJson, projectName, ...buildOpts
    } = finalOptions;

    const server = await adaptServer(adaptUrl, {
        init: finalOptions.initLocalServer,
    });
    const deployment = await createDep(server, projectName, finalOptions.stackName);

    try {
        return buildAndDeploy({
            deployment,
            prevDom: null,
            prevStateJson: initialStateJson,
            ...buildOpts
        });
    } finally {
        await destroyDeployment(server, deployment.deployID);
    }
}
