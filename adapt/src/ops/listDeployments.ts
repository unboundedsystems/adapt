import { adaptServer } from "../server";
import {
    listDeployments as listDeploymentsInner,
} from "../server/deployment";
//import { forkExports } from "./fork";

export interface DeploymentInfo {
    deployID: string;
}

export interface ListOptions {
    adaptUrl: string;
}

export async function listDeployments(options: ListOptions): Promise<DeploymentInfo[] | Error> {
    try {
        const server = await adaptServer(options.adaptUrl, {});
        return await listDeploymentsInner(server);
    } catch (err) {
        return err;
    }
}

//FIXME(manishv) Adding this causes a straggling listener which means processes never exit
//forkExports(module, "listDeployments");
