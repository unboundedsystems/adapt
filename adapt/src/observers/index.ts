import {
    DocumentNode as GraphQLDocument,
    GraphQLSchema
} from "graphql";
import gqlTag from "graphql-tag";
import { CustomError } from "ts-custom-error";
import { ExecutedQuery } from "./obs_manager_deployment";

export interface Observations {
    [observerName: string]: {
        observations: ObserverResponse;
        queries: ExecutedQuery[];
    };
}

export interface ObserverResponse<D = object, C = any> {
    data?: D;
    context?: C;
}

export interface ObserverPlugin<D = object, C = any> {
    readonly schema: GraphQLSchema;
    observe(possibleQueries: ExecutedQuery[]): Promise<ObserverResponse<D, C>>;
}

export const gql: (literals: TemplateStringsArray, ...placeholders: any[]) => GraphQLDocument = gqlTag;

export class ObserverNeedsData extends CustomError {
    public constructor(message?: string) {
        super("Adapt Observer Needs Data: " + (message ? message : "<no message>"));
    }
}

export {
    createObserverManagerDeployment,
    ObserverManagerDeployment,
    ExecutedQuery,
    simplifyNeedsData,
    ObserversThatNeedData
} from "./obs_manager_deployment";

export {
    registerObserver,
    observe,
    makeObserverManagerDeployment,
} from "./registry";

export {
    Observer
} from "./Observer";

export function patchInNewQueries(observations: Observations, queries: { [name: string]: ExecutedQuery[] }): void {
    for (const name in observations) {
        if (!Object.hasOwnProperty.call(observations, name)) continue;
        observations[name].queries = queries[name];
    }
}
