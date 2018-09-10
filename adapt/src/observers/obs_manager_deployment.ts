// The ObserverDeploymentManager manages the functionality needed
// to process observation queries when evaluating the state of a deployment.
//
// The ObserverDataManager (not written yet) manages fetching of observed
// data via poll or watch.

import {
    DocumentNode as Query,
    execute as gqlExecute,
    ExecutionResult,
    GraphQLSchema
} from "graphql";
import { ObserverResponse } from ".";

export interface ObserverManagerDeployment {
    registerSchema(name: string, schema: GraphQLSchema, observations: ObserverResponse): void;
    executeQuery<R = any>(observer: string, q: Query, vars?: { [n: string]: any }): Promise<ExecutionResult<R>>;
}

export function createObserverManagerDeployment() {
    return new ObserverManagerDeploymentImpl();
}

interface Observable {
    schema: GraphQLSchema;
    observations: ObserverResponse;
}

class ObserverManagerDeploymentImpl implements ObserverManagerDeployment {
    observable: { [name: string]: Observable } = {};

    registerSchema(name: string, schema: GraphQLSchema, observations: ObserverResponse): void {
        if (name in this.observable) throw new Error("Cannot register schema with name: " + name);
        this.observable[name] = { schema, observations };
    }

    async executeQuery<R = any>(schemaName: string, q: Query, vars?: { [n: string]: any }):
        Promise<ExecutionResult<R>> {
        if (!(schemaName in this.observable)) throw new Error("Unknown observation schema queried: " + schemaName);
        const { schema, observations } = this.observable[schemaName];
        return Promise.resolve(gqlExecute<R>(schema, q, observations.data, observations.context, vars));
    }
}
