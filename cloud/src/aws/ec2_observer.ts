import {
    ExecutedQuery,
    ObserverNeedsData,
    ObserverPlugin,
    ObserverResponse,
    registerObserver,
    throwObserverErrors,
} from "@adpt/core";
import AWS from "aws-sdk";
import fs from "fs-extra";
import {
    execute,
    GraphQLNonNull,
    GraphQLObjectType,
    GraphQLSchema,
    GraphQLString,
} from "graphql";
import { safeLoad } from "js-yaml";
import path from "path";
import swagger2gql, { ResolverFactory } from "../../src/swagger2gql";
import {
    computeQueryId,
    infoSym,
    Observations,
    ObserveResolverInfo,
    opName,
    QueryParams,
    QueryResolverInfo,
    withParamsProp,
} from "./observer_common";

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

        return async (obj: ObserveResolverInfo, args: any, context: Observations, _info) => {
            const params = obj[infoSym];
            const queryId = computeQueryId(obj[infoSym], fieldName, args);
            const client: any = new AWS.EC2({
                region: params.awsRegion,
                accessKeyId: params.awsAccessKeyId,
                secretAccessKey: params.awsSecretAccessKey,
            });
            // Make the query to AWS
            const ret = await client[opName(fieldName)](args.body).promise();

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

    const text = fs.readFileSync(path.join(__dirname, "ec2_swagger.yaml"));
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

export class AwsEc2Observer implements ObserverPlugin {
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

registerObserver(new AwsEc2Observer());
