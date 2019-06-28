import {
    DocumentNode as GraphQLDocument,
} from "graphql";
import gqlTag from "graphql-tag";
import { ObserverNeedsData } from "./errors";
import { ExecutedQuery, Observations } from "./obs_manager_deployment";

export const gql: (literals: TemplateStringsArray, ...placeholders: any[]) => GraphQLDocument = gqlTag;

export {
    ObserverNeedsData,
    throwObserverErrors,
} from "./errors";

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
        if (queries[name] !== undefined) {
            observations[name].queries = queries[name];
        }
    }
}

export function isObserverNeedsData(e: any): e is ObserverNeedsData {
    return e instanceof ObserverNeedsData;
}
