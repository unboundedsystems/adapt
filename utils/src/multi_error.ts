import { CustomError } from "ts-custom-error";

export class MultiError extends CustomError {
    public constructor(public errors: ReadonlyArray<Error>) {
        super();
        this.message = errors.length === 0 ? "No errors" :
            "Errors:\n" + errors.map((e) => e.message || e.toString()).join("\n");
    }
}
