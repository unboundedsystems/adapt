import { CustomError } from "ts-custom-error";

export class BuildNotImplemented extends CustomError {
    public constructor(message?: string) {
        super(message);
    }
}
