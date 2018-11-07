import {
    DocumentNode as GraphQLDocument,
} from "graphql";
import gqlTag from "graphql-tag";
import { CustomError } from "ts-custom-error";
import { ExecutedQuery, Observations } from "./obs_manager_deployment";

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
    ObserversThatNeedData,
    Observations
} from "./obs_manager_deployment";

export {
    ObserverPlugin,
    ObserverResponse
} from "./plugin";

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
