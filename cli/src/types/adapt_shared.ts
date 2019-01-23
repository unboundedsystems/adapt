// FIXME(mark): Come up with a MUCH better solution for doing runtime type
// checking than this.

import {
    Constructor,
    Message,
    MessageClient,
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

    listDeployments(options: ListOptions): Promise<ListResponse>;
    createDeployment(options: CreateOptions): Promise<DeployState>;
    destroyDeployment(options: DestroyOptions): Promise<ApiResponse>;
    updateDeployment(options: UpdateOptions): Promise<DeployState>;
    fetchStatus(options: StatusOptions): Promise<DeployState>;
}

export function verifyAdaptModule(val: unknown): AdaptModule {
    validateProps("AdaptModule", val, {
        ProjectCompileError: "function",
        ProjectRunError: "function",

        listDeployments: "function",
        createDeployment: "function",
        destroyDeployment: "function",
        updateDeployment: "function",
        fetchStatus: "function",
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
 * Base API return type
 */
export interface ApiResponse {
    type: "success" | "error" | string;
    messages: ReadonlyArray<Message>;
    summary: MessageSummary;
}

export interface ApiSuccess {
    type: "success";
    messages: ReadonlyArray<Message>;
    summary: MessageSummary;
}

/*
 * Types related to deployment
 */
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

export interface WithLogger {
    client?: MessageClient;
    logger?: MessageLogger;
    loggerId?: string;
}

export interface DeployCommonOptions extends WithLogger {
    adaptUrl: string;
    fileName: string;
    stackName: string;

    debug?: string;
    dryRun?: boolean;
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
 * Types related to adapt.listDeployments
 */
export interface DeploymentInfo {
    deployID: string;
}

export interface ListOptions extends WithLogger {
    adaptUrl: string;
}

export interface ListResponse extends ApiResponse {
    type: "success";
    deployments: DeploymentInfo[];
}

/*
 * Types related to adapt.createDeployment
 */
export interface CreateOptions extends DeployCommonOptions {
    projectName: string;

    initLocalServer?: boolean;
    initialStateJson?: string;
    initialObservationsJson?: string;
}

/*
 * Types related to adapt.updateDeployment
 */
export interface UpdateOptions extends DeployCommonOptions {
    deployID: string;
    prevStateJson?: string;
    observationsJson?: string;
}

/*
 * Types related to adapt.destroyDeployment
 */
export interface DestroyOptions extends WithLogger {
    adaptUrl: string;
    deployID: string;
    debug?: string;
    dryRun?: boolean;
}

/*
 * Types related to adapt.fetchStatus
 */
export interface StatusOptions extends DeployCommonOptions {
    deployID: string;
}
