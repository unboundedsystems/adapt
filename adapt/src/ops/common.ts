import { loggerToParentProcess, Message, MessageLogger, MessageStreamer, MessageSummary } from "@usys/utils";
import { ObserversThatNeedData } from "../observers";

export type DeployState = DeploySuccess | DeployError;

export interface DeploySuccess {
    type: "success";
    messages: ReadonlyArray<Message>;
    summary: MessageSummary;

    domXml: string;
    stateJson: string;
    needsData: ObserversThatNeedData;
    deployID: string;
    mountedOrigStatus: any;
}

export interface DeployError {
    type: "error";
    messages: ReadonlyArray<Message>;
    summary: MessageSummary;

    domXml?: string;
    stateJson?: string;
}

export function isDeploySuccess(val: DeployState): val is DeploySuccess {
    return val.type === "success";
}

export interface WithLogger {
    logger?: MessageLogger;
}

export interface DeployCommonOptions extends WithLogger {
    adaptUrl: string;
    fileName: string;
    stackName: string;

    dryRun?: boolean;
    projectRoot?: string;
}

export const defaultDeployCommonOptions = {
    dryRun: false,
    projectRoot: undefined,
};

export async function setupLogger(
    logger: MessageLogger | undefined): Promise<MessageLogger> {

    const from = logger ? logger.from : "deploy";

    if (process.env.ADAPT_OP_FORKED) { // child process
        logger = await loggerToParentProcess(from);

    } else if (!logger) {
        logger = new MessageStreamer(from, {
            outStream: process.stdout,
            errStream: process.stderr,
        });
    }
    return logger;
}
