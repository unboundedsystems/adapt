import { adaptServer } from "../server";
import { destroyDeployment as serverDestroyDeployment } from "../server/deployment";
import {
    defaultDeployCommonOptions,
    setupLogger,
    WithLogger,
} from "./common";
//import { forkExports } from "./fork";

export interface DestroyOptions extends WithLogger {
    adaptUrl: string;
    deployID: string;
    debug?: string;
    dryRun?: boolean;
}

export async function destroyDeployment(optionsIn: DestroyOptions): Promise<Error | undefined> {
    const options = {
        ...defaultDeployCommonOptions,
        ...optionsIn
    };

    const {
        adaptUrl,
        deployID,
        logger: loggerOpt,
    } = options;

    const logger = await setupLogger(loggerOpt);

    try {
        const server = await adaptServer(adaptUrl, {});
        if (!options.dryRun) {
            await serverDestroyDeployment(server, deployID);
        }
    } catch (err) {
        logger.warning(`Error destroying deployment: ${err}`);
        return err;
    }

    return;
}

//FIXME(manishv) Adding this causes a destroyDeployment to never return
//forkExports(module, "destroyDeployment");
