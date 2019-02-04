import { isError } from "lodash";
import { CustomError } from "ts-custom-error";
import { inspect } from "util";

export class InvalidErrorObject extends CustomError {
    constructor(obj: any) {
        super(`An exception was thrown with a non-Error object: ${inspect(obj)}`);
    }
}

export function ensureError(err: any): Error {
    if (isError(err)) return err;
    return new InvalidErrorObject(err);
}
