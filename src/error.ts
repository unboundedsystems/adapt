import { CustomError } from "ts-custom-error";

export class MustReplaceError extends CustomError {
    public constructor(message?: string) {
        super(message);
    }
}
