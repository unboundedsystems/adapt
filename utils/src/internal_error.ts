import { CustomError } from "ts-custom-error";

export class InternalError extends CustomError {
    constructor(msg: string) {
        super(`Internal Error: ${msg}`);
    }
}
