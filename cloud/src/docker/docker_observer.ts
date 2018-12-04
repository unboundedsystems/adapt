import {
    ExecutedQuery,
    ObserverNeedsData,
    ObserverPlugin,
    ObserverResponse,
    registerObserver,
    throwObserverErrors,
} from "@usys/adapt";
import * as fs from "fs-extra";
import {
    execute,
    GraphQLNonNull,
    GraphQLObjectType,
    GraphQLSchema,
    GraphQLString,
} from "graphql";
import { safeLoad } from "js-yaml";
import jsonStableStringify from "json-stable-stringify";
import { isError } from "lodash";
import path from "path";
import URL from "url";
import swagger2gql, { ResolverFactory } from "../../src/swagger2gql";

// tslint:disable-next-line:no-var-requires
const fetchu = require("fetchu");
// tslint:disable-next-line:no-var-requires
const swaggerClient = require("swagger-client");

const infoSym = Symbol("dockerInfoSym");

interface DockerQueryResolverInfo {
    [infoSym]: {
        dockerHost: string;
    };
}
type DockerObserveResolverInfo = DockerQueryResolverInfo;

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

const dockerObserveResolverFactory: ResolverFactory = {
    fieldResolvers: (_type, fieldName, isQuery) => {
        if (!isQuery) return;
        if (fieldName === "withDockerHost") {
            return async (
                _obj,
                args: { dockerHost: string },
                _context: Observations): Promise<DockerObserveResolverInfo> => {

                const dockerHost = args.dockerHost;
                if (dockerHost === undefined) throw new Error("No dockerHost specified");
                return { [infoSym]: { dockerHost } };
            };
        }

        return async (obj: DockerObserveResolverInfo, args, context: Observations, _info) => {
            const req = await swaggerClient.buildRequest({
                spec: dockerSwagger(),
                operationId: fieldName,
                parameters: args,
                requestContentType: "application/json",
                responseContentType: "application/json"
            });

            const dockerHost = obj[infoSym].dockerHost;
            if (dockerHost == null) throw new Error(`Internal error: dockerHost is null`);
            const url = URL.parse(dockerHost);

            const queryId = computeQueryId(obj[infoSym].dockerHost, fieldName, args);
            let ret: any;
            try {
                ret = (url.protocol === "file:" || url.protocol === "unix:") ?
                    await fetchu({ socketPath: url.pathname, path: req.url, ...req }) :
                    await fetchu(dockerHost + req.url, req);

            } catch (e) {
                if (!isError(e)) throw e;
                ret = { noStatus: e.message };
                throw e;
            }
            context[queryId] = ret; //Overwrite in case data got updated on later query
            return ret;
        };
    }
};

const dockerQueryResolverFactory: ResolverFactory = {
    fieldResolvers: (_type, fieldName, isQuery) => {
        if (!isQuery) return;
        if (fieldName === "withDockerHost") {
            return async (
                _obj,
                args: { dockerHost: string },
                _context: Observations): Promise<DockerQueryResolverInfo> => {

                const dockerHost = args.dockerHost;
                if (dockerHost === undefined) throw new Error("No dockerHost specified");
                return { [infoSym]: { dockerHost } };
            };
        }

        return async (obj: DockerQueryResolverInfo, args, context: Observations | undefined, _info) => {
            const queryId = computeQueryId(obj[infoSym].dockerHost, fieldName, args);
            if (!context) throw new ObserverNeedsData();
            if (!Object.hasOwnProperty.call(context, queryId)) throw new ObserverNeedsData();
            return context[queryId];
        };
    }
};

function buildSchema(resolverFactory: ResolverFactory) {
    const schema = swagger2gql(dockerSwagger(), resolverFactory);
    const queryOrig = schema.getQueryType();
    if (queryOrig === undefined) throw new Error("Internal error, invalid schema");
    if (queryOrig === null) throw new Error("Internal Error, invalid schema");

    const dockerQuery = Object.create(queryOrig);
    dockerQuery.name = "DockerApi";

    const query: GraphQLObjectType = new GraphQLObjectType({
        name: "Query",
        fields: () => ({
            withDockerHost: {
                type: dockerQuery,
                args: {
                    dockerHost: {
                        type: new GraphQLNonNull(GraphQLString),
                    }
                },
                resolve:
                    resolverFactory.fieldResolvers ?
                        resolverFactory.fieldResolvers(query, "withDockerHost", true) :
                        () => undefined
            }
        }),
    });

    const dockerObserverSchema = new GraphQLSchema({
        query
    });

    return dockerObserverSchema;
}

let _dockerSwagger: any;

function dockerSwagger() {
    if (_dockerSwagger) return _dockerSwagger;

    const text = fs.readFileSync(path.join(__dirname, "docker_swagger.yaml"));
    _dockerSwagger = safeLoad(text.toString());
    return _dockerSwagger;
}

function buildObserveSchema() {
    return buildSchema(dockerObserveResolverFactory);
}

function buildQuerySchema() {
    return buildSchema(dockerQueryResolverFactory);
}

//Building these can be very slow so we wait for someone to use our observer
let querySchema: GraphQLSchema;
let observeSchema: GraphQLSchema;

export class DockerObserver implements ObserverPlugin {
    static observerName: string;

    get schema() {
        if (!querySchema) querySchema = buildQuerySchema();
        return querySchema;
    }

    observe = async (queries: ExecutedQuery[]): Promise<ObserverResponse<object>> => {
        if (!observeSchema) observeSchema = buildObserveSchema();
        const observations = {};
        const waitFor = queries.map((q) =>
            Promise.resolve(execute(observeSchema, q.query, null, observations, q.variables)));
        throwObserverErrors(await Promise.all(waitFor));

        return { context: observations };
    }
}

registerObserver(new DockerObserver());
