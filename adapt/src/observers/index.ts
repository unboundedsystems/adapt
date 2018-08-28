import {
    DocumentNode as GraphQLDocument,
    GraphQLSchema
} from "graphql";
import gqlTag from "graphql-tag";

export interface ObserverResponse<D = object, C = any> {
    data?: D;
    context?: C;
}

export interface Observer<D = object, C = any> {
    readonly schema: GraphQLSchema;
    observe(
        schema: GraphQLSchema,
        possibleQueries: GraphQLDocument[]): Promise<ObserverResponse<D, C>>;
}

export const gql: (literals: TemplateStringsArray, ...placeholders: any[]) => GraphQLDocument = gqlTag;

export { createObserverManagerDeployment, ObserverManagerDeployment } from "./obs_manager_deployment";
