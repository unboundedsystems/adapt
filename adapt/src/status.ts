import { DocumentNode as Query } from "graphql";
import { CustomError } from "ts-custom-error";
import { childrenToArray, isMountedElement } from "../src/jsx";
import { BuildData } from "./dom";
import { Variables } from "./observers/obs_manager_deployment";
import { ObserverNameHolder } from "./observers/registry";

export type ObserveForStatus<T = unknown> = (
    observer: ObserverNameHolder,
    query: Query,
    vars?: Variables) => Promise<T | undefined>;

export interface Status {
    noStatus?: string | boolean;
    childStatus?: Status[];
    [key: string]: any;
}

export class NoStatusAvailable extends CustomError {
    public constructor(message?: string) {
        super("No Status Available: " + (message ? message : "<no message>"));
    }
}

function hasChildren(x: any): x is { children: unknown } {
    return "children" in x;
}

export async function noStatusOnError(f: () => unknown | Promise<unknown>): Promise<Status> {
    try {
        return (await f()) as Status; //FIXME(manishv) update when we fix status types
    } catch (e) {
        return { noStatus: e.message };
    }
}

export async function defaultChildStatus<P extends object, S = unknown>(
    props: P, mgr: ObserveForStatus, data: BuildData): Promise<Status> {
    let childArray = data.origChildren;
    if (childArray === undefined && hasChildren(props)) {
        childArray = childrenToArray(props.children);
    }

    if (childArray !== undefined) {
        const children = childArray.filter(isMountedElement);
        const childStatusP = children.map((c) => noStatusOnError(() => c.status(mgr)));
        const childStatus = await Promise.all(childStatusP);
        return {
            childStatus
        };
    }
    return { noStatus: "element has no children" };
}

export async function defaultStatus<P extends object, S = unknown>(
    props: P,
    mgr: ObserveForStatus,
    data: BuildData): Promise<Status> {

    const succ = data.successor;

    if (succ === undefined) return defaultChildStatus(props, mgr, data);
    if (succ === null) return { noStatus: "successor was null" };
    return noStatusOnError(() => succ.status());
}
