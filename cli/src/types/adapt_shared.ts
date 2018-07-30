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
    CompileError: Constructor<Error>;

    buildStack(options: BuildOptions): Promise<BuildState>;
}

export function verifyAdaptModule(val: any): AdaptModule {
    if (val == null) throw new ValidationError("AdaptModule", "value is null");

    verifyProp("AdaptModule", val, "buildStack", "function");

    return val as AdaptModule;
}

/*
 * General types
 */
export type Constructor<T extends object> = (new (...args: any[]) => T);
export type Logger = (...args: any[]) => void;

/*
 * Types related to adapt.buildStack
 */
export interface BuildOptions {
    adaptUrl: string;
    fileName: string;
    initialStateJson: string;
    projectName: string;
    deployID: string;
    stackName: string;

    dryRun?: boolean;
    initLocalServer?: boolean;
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

export interface BuildState {
    domXml: string;
    stateJson: string;
    messages: Message[];
    deployId?: string;
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

export function verifyBuildState(val: any): BuildState {
    if (val == null) throw new ValidationError("BuildState", "value is null");
    if (typeof val.domXml !== "string") throw new ValidationError("BuildState", "domXml is invalid");
    if (typeof val.stateJson !== "string") throw new ValidationError("BuildState", "stateJson is invalid");
    verifyMessages(val.messages);

    return val as BuildState;
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
