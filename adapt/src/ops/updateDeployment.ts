import { reanimateDom } from "../reanimate";
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
    prevDomXml: string;
    prevStateJson: string;
}

const defaultOptions = {
};

export async function updateDeployment(options: UpdateOptions): Promise<DeployState> {
    const finalOptions = {
        ...defaultDeployCommonOptions,
        ...defaultOptions,
        ...options
    };
    const { adaptUrl, deployID, prevDomXml, ...buildOpts } = finalOptions;

    try {
        const prevDom = await reanimateDom(prevDomXml);
        const server = await adaptServer(adaptUrl, {});
        const deployment = await loadDeployment(server, deployID);

        return buildAndDeploy({
            deployment,
            prevDom,
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
