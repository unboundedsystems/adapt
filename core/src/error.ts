import { UserError } from "@adpt/utils";
import { CustomError } from "ts-custom-error";
import { inspect } from "util";

export { InternalError } from "@adpt/utils";

export class BuildNotImplemented extends CustomError {
    public constructor(message?: string) {
        super(message);
    }
}

export class ElementNotInDom extends CustomError {
    public constructor(message?: string) {
        super(message);
    }
}

export class ProjectBuildError extends UserError {
    constructor(public domXml: string) {
        super(`Error building Adapt project`);
    }
}

export class ProjectCompileError extends CustomError {
    constructor(msg: string) {
        super(`Error compiling Adapt project\n${msg}`);
    }
}

export class ProjectRunError extends CustomError {
    projectError: Error;
    projectStack: string;
    fullStack: string;

    constructor(projectError: Error, projectStack: string, fullStack: string) {
        let msg = `Error executing Adapt project: `;
        msg += projectError.message || projectError.name;
        super(msg);
        this.projectError = projectError;
        this.projectStack = projectStack;
        this.fullStack = fullStack;
    }
}

export class ThrewNonError extends CustomError {
    constructor(public thrown: any) {
        super(`An exception was thrown with a non-Error object: '${inspect(thrown)}'`);
    }
}

export function isError(val: any): val is Error {
    return (
        (val != null) &&
        (typeof val.message === "string") &&
        (typeof val.name === "string") &&
        (val.stack === undefined || typeof val.stack === "string")
    );
}

export class DeployStepIDNotFound extends CustomError {
    constructor(opID: number, stepNum: number) {
        super(`Deployment step ID ${opID}.${stepNum} not found`);
    }
}

export class DeploymentNotActive extends CustomError {
    constructor(deployID: string) {
        super(`Deployment ${deployID} is not yet active. ` +
            `(DeployOpID 0 has not been deployed)`);
    }
}

export class DeploymentOpIDNotActive extends CustomError {
    constructor(deployID: string, opID: number) {
        super(`Deployment operation ID ${opID} for Deployment ${deployID} ` +
            `is not yet active. (Step 0 has not been deployed)`);
    }
}
