import { adaptServer } from "../server";
import {
    listDeployments as listDeploymentsInner,
} from "../server/deployment";

export interface DeploymentInfo {
    deployID: string;
}

export interface ListOptions {
    adaptUrl: string;
}

export async function listDeployments(options: ListOptions): Promise<DeploymentInfo[] | Error> {
    try {
        const server = await adaptServer(options.adaptUrl, {});
        return listDeploymentsInner(server);
    } catch (err) {
        return err;
    }
}
