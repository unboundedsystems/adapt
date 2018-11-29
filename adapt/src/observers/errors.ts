import { CustomError } from "ts-custom-error";

export class ObserverNeedsData extends CustomError {
    public constructor(message?: string) {
        super("Adapt Observer Needs Data: " + (message ? message : "<no message>"));
    }
}
