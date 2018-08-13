import { Message, MessageLogger, MessageStreamer, MessageSummary } from "../utils";

export type DeployState = DeploySuccess | DeployError;

export interface DeploySuccess {
    type: "success";
    messages: Message[];
    summary: MessageSummary;

    domXml: string;
    stateJson: string;
    deployID: string;
}

export interface DeployError {
    type: "error";
    messages: Message[];
    summary: MessageSummary;

    domXml?: string;
    stateJson?: string;
}

export function isDeploySuccess(val: DeployState): val is DeploySuccess {
    return val.type === "success";
}

export interface DeployCommonOptions {
    adaptUrl: string;
    fileName: string;
    stackName: string;

    dryRun?: boolean;
    logger?: MessageLogger;
    projectRoot?: string;
}

export const defaultDeployCommonOptions = {
    dryRun: false,
    logger: new MessageStreamer("deploy", process.stdout, process.stderr),
    projectRoot: undefined,
};
