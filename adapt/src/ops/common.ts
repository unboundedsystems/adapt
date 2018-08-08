import { Logger, Message } from "..";

export interface DeployState {
    domXml: string;
    stateJson: string;
    messages: Message[];
    deployID: string;
}

export interface DeployCommonOptions {
    adaptUrl: string;
    fileName: string;
    stackName: string;

    dryRun?: boolean;
    log?: Logger;
    projectRoot?: string;
}

export const defaultDeployCommonOptions = {
    dryRun: false,
    // tslint:disable-next-line:no-console
    log: console.log,
    projectRoot: undefined,
};
