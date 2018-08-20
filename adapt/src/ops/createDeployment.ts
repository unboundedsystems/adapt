import { adaptServer, AdaptServer } from "../server";
import {
    createDeployment as createDeploymentObj,
    Deployment,
    destroyDeployment
} from "../server/deployment";
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

    let ds: DeployState;
    let server: AdaptServer | null = null;
    let deployment: Deployment | null = null;
    try {
        server = await adaptServer(adaptUrl, {
            init: finalOptions.initLocalServer,
        });
        deployment = await createDeploymentObj(server, projectName,
                                               finalOptions.stackName);
        ds = await buildAndDeploy({
            deployment,
            prevStateJson: initialStateJson,
            ...buildOpts
        });

    } catch (err) {
        finalOptions.logger.error(`Error creating deployment: ${err}`);
        ds = {
            type: "error",
            messages: finalOptions.logger.messages,
            summary: finalOptions.logger.summary,
            domXml: err.domXml,
        };
    }

    if (server && deployment && (finalOptions.dryRun || ds.type === "error")) {
        try {
            await destroyDeployment(server, deployment.deployID);
        } catch (err) {
            finalOptions.logger.warning(`Error destroying deployment: ${err}`);
        }
    }
    return ds;
}
