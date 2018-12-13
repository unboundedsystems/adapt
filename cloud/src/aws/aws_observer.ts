import {
    ExecutedQuery,
    ObserverNeedsData,
    ObserverPlugin,
    ObserverResponse,
    registerObserver,
    throwObserverErrors,
} from "@usys/adapt";
import aws4sign from "aws4";
import fs from "fs-extra";
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
import fetch from "node-fetch";
import path from "path";
import URL from "url";
import swagger2gql, { ResolverFactory } from "../../src/swagger2gql";
import { AwsCredentialsProps } from "./credentials";

// tslint:disable-next-line:no-var-requires
const swaggerClient = require("swagger-client");

interface AwsQueryParams extends AwsCredentialsProps { }

type QueryParams = AwsQueryParams;

const infoSym = Symbol("adaptObserverInfo");
interface QueryResolverInfo {
    [infoSym]: AwsQueryParams;
}
type ObserveResolverInfo = QueryResolverInfo;

interface Observations {
    [queryId: string]: any;
}

const withParamsProp = "withCredentials";

function computeQueryId(queryParams: QueryParams, fieldName: string, args: unknown) {
    return jsonStableStringify({
        awsRegion: queryParams.awsRegion,
        awsAccessKeyId: queryParams.awsAccessKeyId,
        fieldName, //Note(manishv) should this really be the path in case operationId changes?
        args,
    });
}

/**
 * The AWS swagger specs are broken because the operations have paths with
 * an (erroneous) hash in them like this: "/#DescribeStacks". The swagger
 * client gleefully just tacks on the query string afterwards, which is
 * an invalid url and doesn't allow the url parser to do its job. So just
 * edit the hash out.
 */
function fixupUrl(url: string) {
    return url.replace(/\/#[^?]*\?/, "/?");
}

const observeResolverFactory: ResolverFactory = {
    fieldResolvers: (_type, fieldName, isQuery) => {
        if (!isQuery) return;
        if (fieldName === withParamsProp) {
            return async (
                _obj,
                args: QueryParams,
                _context: Observations): Promise<ObserveResolverInfo> => {

                return { [infoSym]: args };
            };
        }

        return async (obj: ObserveResolverInfo, args, context: Observations, _info) => {
            const params = obj[infoSym];

            const resolved = await swaggerClient.resolve({ spec: swaggerDef() });
            let req = await swaggerClient.buildRequest({
                spec: resolved.spec,
                operationId: fieldName,
                parameters: args,
                requestContentType: "application/json",
                responseContentType: "application/json"
            });

            if (req.body && typeof req.body === "object") {
                req.body = JSON.stringify(req.body);
            }

            // Allow aws4sign to generate hostname
            if (!req.url) throw new Error(`Swagger client did not generate URL`);
            const urlObj = URL.parse(fixupUrl(req.url));
            delete req.url;
            req.path = urlObj.path;

            const auth = {
                accessKeyId: params.awsAccessKeyId,
                secretAccessKey: params.awsSecretAccessKey,
            };
            req = aws4sign.sign({
                ...req,
                service: "cloudformation",
                region: params.awsRegion,
                }, auth);

            const url = urlObj.protocol + "//" + req.headers.Host + urlObj.path;

            console.log("Request:", url, req);
            const queryId = computeQueryId(obj[infoSym], fieldName, args);
            let ret: any;
            try {
                const resp = await fetch(url, req);
                const body = await resp.text();
                if (!resp.ok) throw new Error(`${resp.statusText} (${resp.status}): ${body}`);
                ret = JSON.parse(body);

            } catch (e) {
                if (!isError(e)) throw e;
                ret = { noStatus: e.message };
            }
            context[queryId] = ret; //Overwrite in case data got updated on later query
            return ret;
        };
    }
};

const queryResolverFactory: ResolverFactory = {
    fieldResolvers: (_type, fieldName, isQuery) => {
        if (!isQuery) return;
        if (fieldName === withParamsProp) {
            return async (
                _obj,
                args: QueryParams,
                _context: Observations): Promise<QueryResolverInfo> => {

                return { [infoSym]: args };
            };
        }

        return async (obj: QueryResolverInfo, args, context: Observations | undefined, _info) => {
            const queryId = computeQueryId(obj[infoSym], fieldName, args);
            if (!context) throw new ObserverNeedsData();
            if (!Object.hasOwnProperty.call(context, queryId)) throw new ObserverNeedsData();
            return context[queryId];
        };
    }
};

function buildSchema(resolverFactory: ResolverFactory) {
    const schema = swagger2gql(swaggerDef(), resolverFactory);
    const queryOrig = schema.getQueryType();
    if (queryOrig == null) throw new Error("Internal Error, invalid schema");

    const type = Object.create(queryOrig);
    type.name = "AwsApi";

    const query: GraphQLObjectType = new GraphQLObjectType({
        name: "Query",
        fields: () => ({
            [withParamsProp]: {
                type,
                args: {
                    awsAccessKeyId: {
                        type: new GraphQLNonNull(GraphQLString),
                    },
                    awsSecretAccessKey: {
                        type: new GraphQLNonNull(GraphQLString),
                    },
                    awsRegion: {
                        type: new GraphQLNonNull(GraphQLString),
                    },
                },
                resolve:
                    resolverFactory.fieldResolvers ?
                        resolverFactory.fieldResolvers(query, withParamsProp, true) :
                        () => undefined
            }
        }),
    });

    const observerSchema = new GraphQLSchema({
        query
    });

    return observerSchema;
}

let _swaggerDef: any;

function swaggerDef() {
    if (_swaggerDef) return _swaggerDef;

    const text = fs.readFileSync(path.join(__dirname, "cloudformation_swagger.yaml"));
    _swaggerDef = safeLoad(text.toString());
    return _swaggerDef;
}

function buildObserveSchema() {
    return buildSchema(observeResolverFactory);
}

function buildQuerySchema() {
    return buildSchema(queryResolverFactory);
}

//Building these can be very slow so we wait for someone to use our observer
let querySchema: GraphQLSchema;
let observeSchema: GraphQLSchema;

export class AwsObserver implements ObserverPlugin {
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

registerObserver(new AwsObserver());
