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

    buildStack(fileName: string, stackName: string,
        initialState: any, options?: BuildOptions): BuildState;
    serializeDom(root: UnbsElement): string;

}

export function verifyAdaptModule(val: any): AdaptModule {
    if (val == null) throw new ValidationError("AdaptModule", "value is null");

    if (val.buildStack == null) throw new ValidationError("AdaptModule", "buildStack missing");
    if (typeof val.buildStack !== "function") throw new ValidationError("AdaptModule", "buildStack not a function");

    return val as AdaptModule;
}

/*
 * General types
 */
export type Constructor<T extends object> = (new (...args: any[]) => T);
export interface AnyProps {
    [key: string]: any;
}
export interface UnbsElement<P extends object = AnyProps> {
    readonly props: P;
    readonly componentType: any;
}
export type UnbsElementOrNull = UnbsElement<AnyProps> | null;

/*
 * Types related to adapt.buildStack
 */
export interface BuildOptions {
    rootDir?: string;
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
    dom: UnbsElementOrNull;
    state: any;
    messages: Message[];
}

export function isMessage(m: any): m is Message {
    if (m == null) throw new ValidationError("Message", "value is null");
    if (m.type !== "warning" && m.type !== "error") {
        throw new ValidationError("Message", "bad type property");
    }
    if (typeof m.content !== "string") {
        throw new ValidationError("Message", "content is not string");
    }
    return true;
}

export function verifyBuildState(val: any): BuildState {
    if (val == null) throw new ValidationError("BuildState", "value is null");
    if (val.dom == null) throw new ValidationError("BuildState", "dom missing");
    if (val.state == null) throw new ValidationError("BuildState", "state missing");
    if (val.messages == null) throw new ValidationError("BuildState", "messages missing");
    if (!Array.isArray(val.messages)) throw new ValidationError("BuildState", "messages not an array");

    for (const m of val.messages) {
        isMessage(m);
    }

    return val as BuildState;
}
