// FIXME(mark): Come up with a MUCH better solution for doing runtime type
// checking than this.

import { CustomError } from "ts-custom-error";

export class ValidationError extends CustomError {
    public constructor(typeName: string, message?: string) {
        let m = `Error validating ${typeName}`;
        if (message) m += ": " + message;
        super(m);
    }
}

/*
 * Types related to AdaptModule
 */
export interface AdaptModule {
    ProjectCompileError: Constructor<Error>;
    ProjectRunError: Constructor<ProjectRunError>;

    createDeployment(options: CreateOptions): Promise<DeployState>;
    updateDeployment(options: UpdateOptions): Promise<DeployState>;
}

export function verifyAdaptModule(val: any): AdaptModule {
    if (val == null) throw new ValidationError("AdaptModule", "value is null");

    verifyProp("AdaptModule", val, "ProjectCompileError", "function");
    verifyProp("AdaptModule", val, "ProjectRunError", "function");

    verifyProp("AdaptModule", val, "createDeployment", "function");
    verifyProp("AdaptModule", val, "updateDeployment", "function");

    return val as AdaptModule;
}

/*
 * General types
 */
export type Constructor<T extends object> = (new (...args: any[]) => T);
export type Logger = (...args: any[]) => void;

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
        verifyProps("DeployState", val, {
            messages: "object",
            summary: "object",
            domXml: "string",
            stateJson: "string",
            deployID: "string",
        });
    } else if (val.type === "error") {
        verifyProps("DeployState", val, {
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

/*
 * Messages
 */
export enum MessageType {
    info = "info",
    warning = "warning",
    error = "error",
}
export interface Message {
    type: MessageType;
    timestamp: number;
    from: string;
    content: string;
}

export interface MessageSummary {
    info: number;
    warning: number;
    error: number;
}

export interface MessageLogger {
    messages: Message[];
    summary: MessageSummary;
    info: Logger;
    warning: Logger;
    error: Logger;
    log: (type: MessageType, arg: any, ...args: any[]) => void;
    append: (this: MessageLogger, toAppend: Message[]) => void;
}

export function verifyMessage(m: any): Message {
    if (m == null) throw new ValidationError("Message", "value is null");
    verifyProps("Message", m, {
        type: "string",
        content: "string",
        from: "string",
        timestamp: "number",
    });
    switch (m.type) {
        case "info":
        case "warning":
        case "error":
            break;
        default:
            throw new ValidationError("Message", "bad type property");
    }
    return m as Message;
}

export function verifyMessages(val: any): Message[] {
    if (val == null) throw new ValidationError("Message[]", "value is null");
    if (typeof val.length !== "number") throw new ValidationError("Message[]", "length is invalid");
    for (const m of val) {
        verifyMessage(m);
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
 * Utilities
 */

function verifyProp(parentType: string, parent: any, prop: string,
                    typeofProp: string) {
    if (parent[prop] == null) {
        throw new ValidationError(parentType, `${typeofProp} property '${prop}' is missing`);
    }
    if (typeof parent[prop] !== typeofProp) {
        throw new ValidationError(parentType, `property '${prop}' is not a ${typeofProp}`);
    }
}

interface PropList {
    [prop: string]: string; // typeof prop
}

function verifyProps(parentType: string, parent: any, props: PropList) {
    for (const prop of Object.keys(props)) {
        verifyProp(parentType, parent, prop, props[prop]);
    }
}
