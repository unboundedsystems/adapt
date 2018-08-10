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

export enum MessageType {
    warning = "warning",
    error = "error",
}

export interface Message {
    type: MessageType;
    content: string;
}

export function verifyMessage(m: any): Message {
    if (m == null) throw new ValidationError("Message", "value is null");
    if (m.type !== "warning" && m.type !== "error") {
        throw new ValidationError("Message", "bad type property");
    }
    if (typeof m.content !== "string") {
        throw new ValidationError("Message", "content is not string");
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

export function verifyDeployState(val: any): DeployState {
    if (val == null) throw new ValidationError("DeployState", "value is null");
    verifyProp("DeployState", val, "domXml", "string");
    verifyProp("DeployState", val, "stateJson", "string");
    verifyProp("DeployState", val, "deployID", "string");
    verifyMessages(val.messages);

    return val as DeployState;
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
    prevDomXml: string;
    prevStateJson: string;
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
