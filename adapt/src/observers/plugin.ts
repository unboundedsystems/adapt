import { GraphQLSchema } from "graphql";
import { ExecutedQuery } from "./obs_manager_deployment";

export interface ObserverResponse<D = object, C = any> {
    data?: D;
    context?: C;
}

export interface ObserverPlugin<D = object, C = any> {
    readonly schema: GraphQLSchema;
    observe(possibleQueries: ExecutedQuery[]): Promise<ObserverResponse<D, C>>;
}
