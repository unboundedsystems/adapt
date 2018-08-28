// The ObserverDeploymentManager manages the functionality needed
// to process observation queries when evaluating the state of a deployment.
//
// The ObserverDataManager (not written yet) manages fetching of observed
// data via poll or watch.

import {
    DocumentNode as Query,
    execute as gqlExecute,
    GraphQLSchema
} from "graphql";
import { ObserverResponse } from ".";

export interface ObserverManagerDeployment {
    registerSchema(name: string, schema: GraphQLSchema, observations: ObserverResponse): void;
    executeQuery<O, R extends object = any>(observer: string, q: Query): Promise<R>;
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

    async executeQuery<O, R extends object>(schemaName: string, q: Query): Promise<R> {
        if (!(schemaName in this.observable)) throw new Error("Unknown observation schema queried: " + schemaName);
        const { schema, observations } = this.observable[schemaName];
        return await gqlExecute(schema, q, observations.data, observations.context) as R | Promise<R>;
    }
}
