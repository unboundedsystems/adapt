import { DocumentNode as Query } from "graphql";
import { CustomError } from "ts-custom-error";
import { childrenToArray } from "../src/jsx";
import { Variables } from "./observers/obs_manager_deployment";
import { ObserverNameHolder } from "./observers/registry";

export type ObserveForStatus<T = unknown> = (
    observer: ObserverNameHolder,
    query: Query,
    vars?: Variables) => Promise<T | undefined>;

export interface Status {
    noStatus?: true;
    childStatus?: Status[];
}

export class NoStatusAvailable extends CustomError {
    public constructor(message?: string) {
        super("No Status Available: " + (message ? message : "<no message>"));
    }
}

function hasChildren(x: any): x is { children: unknown } {
    return "children" in x;
}

export async function defaultStatus<P extends object, S = unknown>(props: P, _state?: S): Promise<Status> {
    if (hasChildren(props)) {
        const childStatusP = childrenToArray(props.children).map((c) => c.status());
        const childStatus = await Promise.all(childStatusP);
        return {
            childStatus
        };
    }
    return { noStatus: true };
}
