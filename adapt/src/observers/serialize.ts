import { removeUndef } from "@usys/utils";
import {
    parse as gqlParse,
    print as gqlPrint
} from "graphql";
import * as ld from "lodash";
import { ExecutedQuery, Observations, ObserverResponse } from ".";

function isObject(x: unknown): x is object {
    return ld.isObject(x);
}

export function reconstituteObservations(observerName: string, candidate: unknown): ObserverResponse {
    if (!isObject(candidate)) throw new Error(`Stored observation is not an observer response for ${observerName}`);

    const reference: ObserverResponse = { data: {}, context: {} };
    const illegalKeys = Object.keys(candidate).filter((key) => !(key in reference));
    if (illegalKeys.length !== 0) {
        throw new Error(`Illegal keys ${illegalKeys} in observations for observer ${observerName}`);
    }
    return candidate as ObserverResponse;
}

function hasExecutedQueryShape(candidate: unknown): candidate is { query: string, variables?: object[] } {
    if (!isObject(candidate)) return false;

    if (!("query" in candidate)) return false;
    const query = (candidate as any).query;
    const vars = (candidate as any).variables;
    if (vars && !ld.isObject(vars)) return false;
    if (vars && ld.isArray(vars)) return false;
    if (!ld.isString(query)) return false;
    return true;
}

export function reconstituteExecutedQuery(observerName: string, candidate: unknown): ExecutedQuery {
    if (!isObject(candidate)) throw new Error(`Stored executed query is not a legal query for ${observerName}`);

    const reference: Partial<ExecutedQuery> = { query: undefined, variables: [] };
    const illegalKeys = Object.keys(candidate).filter((key) => !(key in reference));
    if (illegalKeys.length !== 0) {
        throw new Error(`Illegal keys ${illegalKeys} in stored queries for observer ${observerName}`);
    }
    if (!hasExecutedQueryShape(candidate)) {
        throw new Error(`Invalid shape for stored executed query for observer ${observerName}`);
    }

    const query = gqlParse(candidate.query);
    const variables = candidate.variables;

    return removeUndef({ query, variables });
}

export function reconstituteExecutedQueries(observerName: string, candidate: unknown): ExecutedQuery[] {
    if (!ld.isArray(candidate)) {
        throw new Error(`Stored executed queries is not an observer response for ${observerName}`);
    }

    return candidate.map((val) => reconstituteExecutedQuery(observerName, val));
}

export function reconstituteObserverObservations(observerName: string, candidate: unknown) {
    if (!isObject(candidate)) throw new Error(`Stored observation is not an observer response for ${observerName}`);

    const ret: { observations: ObserverResponse, queries: ExecutedQuery[] } = { observations: {}, queries: [] };
    for (const key in candidate) {
        if (!Object.hasOwnProperty.call(candidate, key)) continue;
        const val: unknown = (candidate as any)[key];
        switch (key) {
            case "observations":
                ret.observations = reconstituteObservations(observerName, val);
                break;
            case "queries":
                ret.queries = reconstituteExecutedQueries(observerName, val);
                break;
            default:
                throw new Error(`Unknown key ${key} for observations for observer ${observerName}`);
        }
    }
    return ret;
}

export function reconstituteAllObservations(candidate: unknown): Observations {
    if (!isObject(candidate)) throw new Error(`Stored object is not a set of observations for all observers`);

    const ret: Observations = {};
    for (const key in candidate) {
        if (!Object.hasOwnProperty.call(candidate, key)) continue;
        ret[key] = reconstituteObserverObservations(key, (candidate as any)[key]);
    }
    return ret;
}

export interface PreparedExecutedQuery {
    query: string;
    variables?: { [name: string]: any };
}

export interface PreparedObservations {
    [observer: string]: {
        observations: ObserverResponse;
        queries: PreparedExecutedQuery[];
    };
}

export function prepareExecutedQuery(query: ExecutedQuery): PreparedExecutedQuery {
    const queryStr = gqlPrint(query.query);
    return removeUndef({ query: queryStr, variables: query.variables });
}

export function prepareAllObservationsForJson(observations: Observations): PreparedObservations {
    const ret: PreparedObservations = {};
    for (const observerName in observations) {
        if (!Object.hasOwnProperty.call(observations, observerName)) continue;
        const o = observations[observerName];
        const obsResp = o.observations;
        ret[observerName] = {
            observations: obsResp,
            queries: o.queries.map((q) => prepareExecutedQuery(q))
        };
    }
    return ret;
}
