import { CustomError } from "ts-custom-error";
import { isInstance, tagConstructor } from "./is_instance";

export class MultiError extends CustomError {
    public constructor(public errors: ReadonlyArray<Error>) {
        super();
        this.message = errors.length === 0 ? "No errors" :
            "Errors:\n" + errors.map((e) => e.message || e.toString()).join("\n");
    }
}
tagConstructor(MultiError, "adapt/utils");

export function isMultiError(err: any): err is MultiError {
    return isInstance(err, MultiError, "adapt/utils");
}
