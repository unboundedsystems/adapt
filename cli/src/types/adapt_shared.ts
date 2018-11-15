// FIXME(mark): Come up with a MUCH better solution for doing runtime type
// checking than this.

import {
    Constructor,
    Message,
    MessageLogger,
    MessageSummary,
    validateMessage,
    validateProps,
    ValidationError,
} from "@usys/utils";

/*
 * Types related to AdaptModule
 */
export interface AdaptModule {
    ProjectCompileError: Constructor<Error>;
    ProjectRunError: Constructor<ProjectRunError>;

    createDeployment(options: CreateOptions): Promise<DeployState>;
    updateDeployment(options: UpdateOptions): Promise<DeployState>;
    fetchStatus(options: StatusOptions): Promise<DeployState>;
}

export function verifyAdaptModule(val: unknown): AdaptModule {
    validateProps("AdaptModule", val, {
        ProjectCompileError: "function",
        ProjectRunError: "function",

        createDeployment: "function",
        updateDeployment: "function",
    });

    return val as AdaptModule;
}

/*
 * Error types
 */
export interface ProjectRunError extends Error {
    projectError: Error;
    projectStack: string;
    fullStack: string;
}

/*
 * Types related to deployment
 */
export type DeployState = DeploySuccess | DeployError;

export interface DeploySuccess {
    type: "success";
    messages: Message[];
    summary: MessageSummary;

    domXml: string;
    stateJson: string;
    needsData: ObserversThatNeedData;
    deployID: string;
    mountedOrigStatus: any;
}

export interface DeployError {
    type: "error";
    messages: Message[];
    summary: MessageSummary;

    domXml?: string;
    stateJson?: string;
}

export function verifyDeployState(val: any): DeployState {
    if (val == null) throw new ValidationError("DeployState", "value is null");
    if (val.type === "success") {
        validateProps("DeployState", val, {
            messages: "object",
            summary: "object",
            domXml: "string",
            stateJson: "string",
            deployID: "string",
        });
    } else if (val.type === "error") {
        validateProps("DeployState", val, {
            messages: "object",
            summary: "object",
        });
    }
    verifyMessages(val.messages);

    return val as DeployState;
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

interface Variables {
    [n: string]: any;
}

interface PodExecutedQuery {
    query: string;
    variables?: Variables;
}

export interface ObserversThatNeedData {
    [name: string]: PodExecutedQuery[];
}

export function verifyMessages(val: any): Message[] {
    if (val == null) throw new ValidationError("Message[]", "value is null");
    if (typeof val.length !== "number") throw new ValidationError("Message[]", "length is invalid");
    for (const m of val) {
        validateMessage(m);
    }

    return val as Message[];
}

/*
 * Types related to adapt.createDeployment
 */
export interface CreateOptions extends DeployCommonOptions {
    projectName: string;

    initLocalServer?: boolean;
    initialStateJson?: string;
}

/*
 * Types related to adapt.updateDeployment
 */
export interface UpdateOptions extends DeployCommonOptions {
    deployID: string;
    prevStateJson?: string;
}

/*
 * Types related to adapt.fetchStatus
 */
export interface StatusOptions extends DeployCommonOptions {
    deployID: string;
}
