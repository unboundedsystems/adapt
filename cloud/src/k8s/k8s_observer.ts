/*
 * Copyright 2018-2019 Unbounded Systems, LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {
    ExecutedQuery,
    ObserverNeedsData,
    ObserverPlugin,
    ObserverResponse,
    registerObserver,
    throwObserverErrors,
} from "@adpt/core";
import { execute, GraphQLNonNull, GraphQLObjectType, GraphQLSchema, } from "graphql";
import GraphQLJSON = require("graphql-type-json");
import * as https from "https";
import jsonStableStringify = require("json-stable-stringify");
import fetch, { Response } from "node-fetch";
import { CustomError } from "ts-custom-error";
import k8sSwagger = require("../../src/k8s/kubernetes-1.8-swagger.json");
import swagger2gql, { ResolverFactory } from "../../src/swagger2gql";
import { Kubeconfig } from "./common";

// tslint:disable-next-line:no-var-requires
const swaggerClient = require("swagger-client");

export class K8sNotFound extends CustomError {
    request?: { kind: string; name: string; };

    constructor(jsonBody: any) {
        let msg = `Resource not found`;
        const info = jsonBody && jsonBody.message;
        if (info) msg += ": " + info;
        super(msg);
        const request = jsonBody && jsonBody.details;
        if (request && typeof request.kind === "string" &&
            typeof request.name === "string") {
            this.request = request;
        }
    }
}

export class K8sResponseError extends CustomError {
    constructor(resp: Response, public status: any) {
        super(`Error fetching ${resp.url}: status ${resp.statusText} ` +
            `(${resp.status}): ${status.message || ""}\n` +
            JSON.stringify(status, null, 2));
    }
}

export function getK8sConnectInfo(kubeconfig: Kubeconfig) {
    function byName(name: string) { return (x: { name: string }) => x.name === name; }
    const contextName: string = kubeconfig["current-context"];
    const context = kubeconfig.contexts.find(byName(contextName));
    if (!context) throw new Error(`Could not find context ${contextName}`);

    const cluster = kubeconfig.clusters.find(byName(context.context.cluster));
    const user = kubeconfig.users.find(byName(context.context.user));

    if (!cluster) throw new Error(`Could not find cluster ${context.context.cluster}`);
    const caData = cluster.cluster["certificate-authority-data"];
    const ca = caData ? Buffer.from(caData, "base64").toString() : undefined;

    const url = cluster.cluster.server;

    if (!user) throw new Error(`Could not find user ${context.context.user}`);
    const keyData = user.user["client-key-data"];
    const certData = user.user["client-certificate-data"];
    const key = keyData && Buffer.from(keyData, "base64").toString();
    const cert = certData && Buffer.from(certData, "base64").toString();
    const username = user.user.username;
    const password = user.user.password;

    return {
        ca,
        url,
        key,
        cert,
        username,
        password,
    };
}

const infoSym = Symbol("k8sInfoSym");

interface K8sQueryResolverInfo {
    [infoSym]: {
        id: unknown;
    };
}

interface K8sObserveResolverInfo {
    [infoSym]: {
        host: string;
        agent: https.Agent;
        id: unknown;
        headers: { Authorization?: string; };
    };
}

interface Observations {
    [queryId: string]: any;
}

function computeQueryId(clusterId: unknown, fieldName: string, args: unknown) {
    return jsonStableStringify({
        clusterId,
        fieldName, //Note(manishv) should this really be the path in case operationId changes?
        args,
    });
}

export function authHeaders(user: { username?: string; password?: string }) {
    if (!user.username || !user.password) return {};

    const auth = Buffer.from(user.username + ":" + user.password).toString("base64");
    return {
        Authorization: "Basic " + auth
    };
}

const k8sObserveResolverFactory: ResolverFactory = {
    fieldResolvers: (_type, fieldName, isQuery) => {
        if (!isQuery) return;
        if (fieldName === "withKubeconfig") {
            return async (
                _obj,
                args: { kubeconfig: Kubeconfig },
                _context: Observations): Promise<K8sObserveResolverInfo> => {

                const kubeconfig = args.kubeconfig;
                if (kubeconfig === undefined) throw new Error("No kubeconfig specified");
                const info = getK8sConnectInfo(kubeconfig);
                const host = info.url;
                const agent = new https.Agent({
                    key: info.key,
                    cert: info.cert,
                    ca: info.ca,
                });
                const headers = authHeaders(info);
                //FIXME(manishv) Canonicalize id here (e.g. port, fqdn, etc.)
                return { [infoSym]: { host, agent, id: host, headers } };
            };
        }

        return async (obj: K8sObserveResolverInfo, args, context: Observations, _info) => {
            const req = await swaggerClient.buildRequest({
                spec: k8sSwagger,
                operationId: fieldName,
                parameters: args,
                requestContentType: "application/json",
                responseContentType: "application/json"
            });

            const url = obj[infoSym].host + req.url;
            const headers = obj[infoSym].headers;
            const resp = await fetch(url, { ...req, agent: obj[infoSym].agent, headers });
            const ret = await resp.json();

            if (resp.status === 404) throw new K8sNotFound(ret);
            else if (!resp.ok) throw new K8sResponseError(resp, ret);

            const queryId = computeQueryId(obj[infoSym].id, fieldName, args);
            context[queryId] = ret; //Overwrite in case data got updated on later query

            return ret;
        };
    }
};

const k8sQueryResolverFactory: ResolverFactory = {
    fieldResolvers: (_type, fieldName, isQuery) => {
        if (!isQuery) return;
        if (fieldName === "withKubeconfig") {
            return async (
                _obj,
                args: { kubeconfig: Kubeconfig },
                _context: Observations): Promise<K8sQueryResolverInfo> => {

                const kubeconfig = args.kubeconfig;
                if (kubeconfig === undefined) throw new Error("No kubeconfig specified");
                const info = getK8sConnectInfo(kubeconfig);
                return { [infoSym]: { id: info.url } };
            };
        }

        return async (obj: K8sQueryResolverInfo, args, context: Observations | undefined, _info) => {
            const queryId = computeQueryId(obj[infoSym].id, fieldName, args);
            if (!context) throw new ObserverNeedsData();
            if (!Object.hasOwnProperty.call(context, queryId)) throw new ObserverNeedsData();
            return context[queryId];
        };
    }
};

function buildSchema(resolverFactory: ResolverFactory) {
    const k8sSchema = swagger2gql(k8sSwagger, resolverFactory);
    const k8sQueryOrig = k8sSchema.getQueryType();
    if (k8sQueryOrig === undefined) throw new Error("Internal error, invalid kubernetes schema");
    if (k8sQueryOrig === null) throw new Error("Internal Error, invalid kuberenetes schema");

    const k8sQuery = Object.create(k8sQueryOrig);
    k8sQuery.name = "K8sApi";

    const query: GraphQLObjectType = new GraphQLObjectType({
        name: "Query",
        fields: () => ({
            withKubeconfig: {
                type: k8sQuery,
                args: {
                    kubeconfig: {
                        type: new GraphQLNonNull(GraphQLJSON),
                    }
                },
                resolve:
                    resolverFactory.fieldResolvers ?
                        resolverFactory.fieldResolvers(query, "withKubeconfig", true) :
                        () => undefined
            }
        }),
    });

    const k8sObserverSchema = new GraphQLSchema({
        query
    });

    return k8sObserverSchema;
}

function buildObserveSchema() {
    return buildSchema(k8sObserveResolverFactory);
}

function buildQuerySchema() {
    return buildSchema(k8sQueryResolverFactory);
}

//Building these can be very slow so we wait for someone to use K8sObserver
let querySchema: GraphQLSchema;
let observeSchema: GraphQLSchema;

export class K8sObserver implements ObserverPlugin {
    static observerName: string;

    get schema() {
        if (!querySchema) querySchema = buildQuerySchema();
        return querySchema;
    }

    observe = async (queries: ExecutedQuery[]): Promise<ObserverResponse<object>> => {
        const observations = {};
        if (queries.length > 0) {
            if (!observeSchema) observeSchema = buildObserveSchema();
            const waitFor = queries.map((q) =>
                Promise.resolve(execute(observeSchema, q.query, null, observations, q.variables)));
            throwObserverErrors(await Promise.all(waitFor));
        }

        return { context: observations };
    }
}

registerObserver(new K8sObserver());
