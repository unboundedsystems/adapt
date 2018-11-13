import { ProjectRunError } from "../error";
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
    DeployState,
    setupLogger,
} from "./common";
import { forkExports } from "./fork";

export interface CreateOptions extends DeployCommonOptions {
    projectName: string;

    initLocalServer?: boolean;
    initialStateJson?: string;
    initialObservationsJson?: string;
}

const defaultOptions = {
    initLocalServer: false,
    initialStateJson: "{}",
    initialObservationsJson: "{}"
};

export async function createDeployment(options: CreateOptions): Promise<DeployState> {
    const finalOptions = {
        ...defaultDeployCommonOptions,
        ...defaultOptions,
        ...options
    };

    const {
        adaptUrl,
        initLocalServer,
        initialStateJson,
        initialObservationsJson,
        logger: _logger,
        projectName,
        ...buildOpts
    } = finalOptions;

    const logger = await setupLogger(_logger);

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
            logger,
            prevStateJson: initialStateJson,
            observationsJson: initialObservationsJson,
            ...buildOpts
        });

    } catch (err) {
        const backtrace = err instanceof ProjectRunError ? err.projectStack : err.stack;
        logger.error(`Error creating deployment: ${err}:\n`, backtrace);
        ds = {
            type: "error",
            messages: logger.messages,
            summary: logger.summary,
            domXml: err.domXml,
        };
    }

    if (server && deployment && (finalOptions.dryRun || ds.type === "error")) {
        try {
            await destroyDeployment(server, deployment.deployID);
        } catch (err) {
            logger.warning(`Error destroying deployment: ${err}`);
        }
    }
    return ds;
}

forkExports(module, "createDeployment");
