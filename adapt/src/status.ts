import { CustomError } from "ts-custom-error";

export class NoStatusAvailable extends CustomError {
    public constructor(message?: string) {
        super("No Status Available: " + (message ? message : "<no message>"));
    }
}

export async function defaultStatus<P, S>(props: P, state?: S): Promise<unknown> {
    return {};
}
