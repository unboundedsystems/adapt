import { formatUserError } from "@adpt/utils";
import { ProjectRunError } from "../error";
import { adaptServer, AdaptServer } from "../server";
import {
    createDeployment as createDeploymentObj,
    Deployment,
    destroyDeployment
} from "../server/deployment";
import { HistoryStatus } from "../server/history";
import { buildAndDeploy } from "./buildAndDeploy";
import {
    defaultDeployCommonOptions,
    DeployCommonOptions,
    DeployState,
    withOpsSetup,
} from "./common";
import { forkExports } from "./fork";

export interface CreateOptions extends DeployCommonOptions {
    projectName: string;
    stackName: string;

    deployID?: string;
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
        client,
        deployID,
        initLocalServer,
        initialStateJson,
        initialObservationsJson,
        logger: _logger,
        loggerId,
        projectName,
        ...buildOpts
    } = finalOptions;

    const setup = {
        name: "createDeployment",
        description: "Creating deployment",
        client,
        logger: _logger,
        loggerId,
    };
    return withOpsSetup(setup, async (info): Promise<DeployState> => {
        const { logger, taskObserver } = info;
        let ds: DeployState;
        let server: AdaptServer | null = null;
        let deployment: Deployment | null = null;
        try {
            server = await adaptServer(adaptUrl, {
                init: finalOptions.initLocalServer,
            });
            deployment = await createDeploymentObj(
                server,
                projectName,
                finalOptions.stackName, {
                    deployID,
                });
            ds = await buildAndDeploy({
                deployment,
                prevStateJson: initialStateJson,
                observationsJson: initialObservationsJson,
                taskObserver,
                ...buildOpts
            });

        } catch (err) {
            const message = err instanceof ProjectRunError ?
                `${err.message}:\n${err.projectStack}` :
                formatUserError(err);
            logger.error(`Error creating deployment: ${message}`);
            ds = {
                type: "error",
                messages: logger.messages,
                summary: logger.summary,
                domXml: err.domXml,
            };
            if (deployment) {
                // NOTE(mark): TS 3.0.3 incorrectly narrows deployment to
                // null within the catch
                const dep = deployment as Deployment;
                // If there's a History entry, the deploy failed during act,
                // which means there could be a partial deploy.
                // Give the user the deployID so they can decide what to do.
                if (await dep.lastEntry(HistoryStatus.complete)) {
                    ds.deployID = dep.deployID;
                }
            }
        }

        if (server && deployment && (finalOptions.dryRun || !ds.deployID)) {
            try {
                await destroyDeployment(server, deployment.deployID);
            } catch (err) {
                logger.warning(`Error destroying deployment: ${err}`);
            }
        }
        return ds;
    });
}

forkExports(module, "createDeployment");
