import {
    createTaskObserver,
    loggerToParentProcess,
    Message,
    MessageLogger,
    MessageStreamer,
    MessageSummary,
    TaskObserver,
} from "@usys/utils";
import { ObserversThatNeedData } from "../observers";

export interface ApiResponse {
    type: "success" | "error" | string;
    messages: ReadonlyArray<Message>;
    summary: MessageSummary;
}

export type DeployState = DeploySuccess | DeployError;

export interface DeploySuccess extends ApiResponse {
    type: "success";

    domXml: string;
    stateJson: string;
    needsData: ObserversThatNeedData;
    deployID: string;
    mountedOrigStatus: any;
}

export interface DeployError extends ApiResponse {
    type: "error";

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

    debug?: string;
    dryRun?: boolean;
    projectRoot?: string;
}

export const defaultDeployCommonOptions = {
    debug: "",
    dryRun: false,
    projectRoot: undefined,
};

async function setupLogger(
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

export interface DebugFlags {
    [ flag: string ]: true;
}

export function parseDebugString(s: string): DebugFlags {
    const flags: DebugFlags = {};
    s.split(/\s*,\s*/).map((f) => flags[f] = true);
    return flags;
}

export interface OpsSetupOptions {
    name: string;          // Task name
    description: string;  // Task description
    logger?: MessageLogger;
}

export interface OpsSetupInfo {
    logger: MessageLogger;
    taskObserver: TaskObserver;
}

export type OpsFunction<T extends ApiResponse> = (info: OpsSetupInfo) => T | Promise<T>;

export async function withOpsSetup<T extends ApiResponse>(
    options: OpsSetupOptions,
    func: OpsFunction<T>): Promise<T> {

    const logger = await setupLogger(options.logger);
    const taskObserver = createTaskObserver(options.name, {
        logger,
        description: options.description,
    });

    try {
        taskObserver.started();
        const ret = await func({ logger, taskObserver });
        taskObserver.complete();
        return ret;

    } catch (err) {
        const msg = `Error ${options.description}: ${err.message}`;
        logger.error(msg);
        taskObserver.failed(msg);
        const ret: ApiResponse = {
            type: "error",
            messages: logger.messages,
            summary: logger.summary,
        };
        return ret as T;
    }
}
