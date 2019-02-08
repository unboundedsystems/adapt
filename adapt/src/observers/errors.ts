import { MultiError, notNull } from "@usys/utils";
import { ExecutionResult, GraphQLError } from "graphql";
import { flatten } from "lodash";
import { CustomError } from "ts-custom-error";

export class ObserverNeedsData extends CustomError {
    public constructor(message?: string) {
        super("Adapt Observer Needs Data: " + (message ? message : "<no message>"));
    }
}

export function throwObserverErrors(results: ExecutionResult[]) {
    const errors = results.map((r) => r.errors).filter(notNull);
    if (errors.length === 0) return;
    // Type assertion below is due to inability of type def for flatten to
    // accept a ReadonlyArray. See comment on "Many" type in lodash .d.ts file.
    throw new MultiError(flatten(errors as GraphQLError[][]));
}
