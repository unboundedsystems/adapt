import {
    ExecutedQuery,
    ObserverNeedsData,
    ObserverPlugin,
    ObserverResponse,
    registerObserver,
    throwObserverErrors,
} from "@usys/adapt";
import { execute, GraphQLNonNull, GraphQLObjectType, GraphQLSchema, } from "graphql";
import GraphQLJSON = require("graphql-type-json");
import * as https from "https";
import jsonStableStringify = require("json-stable-stringify");
import fetch from "node-fetch";
import k8sSwagger = require("../../src/k8s/kubernetes-1.8-swagger.json");
import swagger2gql, { ResolverFactory } from "../../src/swagger2gql";

// tslint:disable-next-line:no-var-requires
const swaggerClient = require("swagger-client");

export interface Kubeconfig {
    kind: "Config";
    "current-context": string;
    contexts: [{
        name: string,
        context: {
            cluster: string,
            user: string
        }
    }];
    clusters: [{
        name: string,
        cluster: {
            "certificate-authority-data": string;
            server: string;
        };
    }];
    users: [{
        name: string,
        user: {
            "client-certificate-data": string,
            "client-key-data": string
        }
    }];
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
    const key = Buffer.from(keyData, "base64").toString();
    const cert = Buffer.from(certData, "base64").toString();

    return {
        ca,
        url,
        key,
        cert
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
                //FIXME(manishv) Canonicalize id here (e.g. port, fqdn, etc.)
                return { [infoSym]: { host, agent, id: host } };
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
            const resp = await fetch(url, { ...req, agent: obj[infoSym].agent });
            if (resp.status !== 200) {
                throw new Error(`Error fetching ${url}: status ${resp.statusText}(${resp.status}):`
                    + `${JSON.stringify(await resp.json(), undefined, 2)}`);
            }

            const ret = await resp.json();
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
