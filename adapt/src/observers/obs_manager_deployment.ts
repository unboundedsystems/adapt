// The ObserverDeploymentManager manages the functionality needed
// to process observation queries when evaluating the state of a deployment.
//
// The ObserverDataManager (not written yet) manages fetching of observed
// data via poll or watch.

import {
    DocumentNode as Query,
    execute as gqlExecute,
    ExecutionResult,
    GraphQLSchema,
    print as gqlPrint
} from "graphql";
import * as ld from "lodash";
import * as util from "util";
import { Observations, ObserverResponse } from ".";

interface Variables {
    [n: string]: any;
}

export interface ExecutedQuery {
    query: Query;
    variables?: Variables;
}

export interface ObserverManagerDeployment {
    registerSchema(name: string, schema: GraphQLSchema, observations: ObserverResponse): void;
    executedQueries(): { [name: string]: ExecutedQuery[] };
    executeQuery<R = any>(observer: string, q: Query, vars?: Variables): Promise<ExecutionResult<R>>;
}

export function createObserverManagerDeployment() {
    return new ObserverManagerDeploymentImpl();
}

type ExecutedQueryStorage = Map<string, { doc: Query, vars: Set<Variables | undefined> }>;

interface Observable {
    schema: GraphQLSchema;
    observations: ObserverResponse;
    executedQueries: ExecutedQueryStorage;
}

function addExecutedQuery(o: ExecutedQueryStorage, query: ExecutedQuery) {
    const key = gqlPrint(query.query); //Would be better to have canonicalized key here
    const entry = o.get(key);
    if (entry === undefined) {
        const vars = new Set<Variables | undefined>([query.variables]);
        o.set(key, { doc: query.query, vars: ld.cloneDeep(vars) });
        return;
    }

    //FIXME(manishv) If this is slow, need a better data structure for unique vars
    for (const val of entry.vars) {
        if (ld.isEqual(val, query.variables)) return;
    }

    //If we made it here, we need to add current query variabless to the set
    entry.vars.add(query.variables);
}

class ObserverManagerDeploymentImpl implements ObserverManagerDeployment {
    observable: { [name: string]: Observable } = {};

    registerSchema = (name: string, schema: GraphQLSchema, observations: ObserverResponse): void => {
        if (name in this.observable) throw new Error("Cannot register schema with name: " + name);
        this.observable[name] = {
            schema,
            observations,
            executedQueries: new Map<string, { doc: Query, vars: Set<Variables | undefined> }>()
        };
    }

    executedQueries = () => {
        const ret: { [name: string]: ExecutedQuery[] } = {};
        for (const schemaName in this.observable) {
            if (Object.hasOwnProperty.call(this.observable, schemaName)) {
                ret[schemaName] = [];
                for (const val of this.observable[schemaName].executedQueries.values()) {
                    for (const vars of val.vars.values()) {
                        ret[schemaName].push({ query: val.doc, variables: vars });
                    }
                }
            }
        }
        return ret;
    }

    executeQuery = async <R = any>(schemaName: string, q: Query, vars?: Variables):
        Promise<ExecutionResult<R>> => {
        if (!(schemaName in this.observable)) throw new Error("Unknown observation schema queried: " + schemaName);
        const { schema, observations, executedQueries } = this.observable[schemaName];
        addExecutedQuery(executedQueries, { query: q, variables: vars });
        return Promise.resolve(gqlExecute<R>(schema, q, observations.data, observations.context, vars));
    }
}

function isObject(x: unknown): x is object {
    return ld.isObject(x);
}

function checkObservationObj(observerName: string, candidate: unknown) {
    if (!isObject(candidate)) throw new Error(`Stored observation is not an observation for ${observerName}`);
    const storedObj = candidate;
    const storedObjKeys = Object.keys(storedObj);
    const illegalKeys = storedObjKeys.filter((val) => {
        switch (val) {
            case "data":
            case "context":
                return false;
            default:
                return true;
        }
    });
    if (illegalKeys.length !== 0) {
        throw new Error(`Extra keys ${util.inspect(illegalKeys)} for ${observerName} observations`);
    }
}

export function parseObservationsJson(json: string): Observations {
    const topObj = JSON.parse(json);
    for (const key in topObj) {
        if (!Object.hasOwnProperty.call(topObj, key)) continue;
        checkObservationObj(key, topObj[key]);
        //FIXME(manishv) drop observations for unregistered observers here
    }
    return topObj;
}
