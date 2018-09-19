import {
    DocumentNode as GraphQLDocument,
    GraphQLSchema
} from "graphql";
import gqlTag from "graphql-tag";
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

export interface Observer<D = object, C = any> {
    readonly schema: GraphQLSchema;
    observe(
        schema: GraphQLSchema,
        possibleQueries: ExecutedQuery[]): Promise<ObserverResponse<D, C>>;
}

export const gql: (literals: TemplateStringsArray, ...placeholders: any[]) => GraphQLDocument = gqlTag;

export {
    createObserverManagerDeployment,
    ObserverManagerDeployment,
    ExecutedQuery
} from "./obs_manager_deployment";

export {
    registerObserver,
    makeObserverManagerDeployment,
} from "./registry";
