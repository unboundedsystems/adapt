import {
    GraphQLBoolean,
    GraphQLFieldConfig,
    GraphQLFieldConfigArgumentMap,
    GraphQLFieldConfigMap,
    GraphQLFloat,
    GraphQLInputType,
    GraphQLInt,
    GraphQLNonNull,
    GraphQLObjectType,
    GraphQLSchema,
    GraphQLString,
    GraphQLType,
    isInputType
} from "graphql";

import {
    isRef,
    Swagger2,
    Swagger2Operation,
    Swagger2Parameter,
    Swagger2Ref
} from "../../src/swagger2gql/swagger_types";
import { TypeResolver } from "../../src/swagger2gql/type_resolver";

function resolveType(_swagger: Swagger2, tyName: string): GraphQLType {
    throw new Error("Type not found: " + tyName);
}

function populateBasicSwaggerTypes(resolver: TypeResolver<GraphQLType>) {
    resolver.addType("integer", GraphQLInt);
    resolver.addType("number", GraphQLFloat);
    resolver.addType("string", GraphQLString);
    resolver.addType("boolean", GraphQLBoolean);
}

async function getParameterInfo(
    param: Swagger2Parameter,
    resolver: TypeResolver<GraphQLType>) {
    if (param.in === "body") {
        throw new Error("Body parameters not supported");
    } else {
        return {
            //FIXME(manishv) Need to make sure we only use InputObjectTypes for objects here
            type: await resolver.getType(param.type),
            required: param.required ? param.required : false,
            default: param.default
        };
    }
}

async function buildArgsForOperation(
    operationId: string | undefined,
    parameters: (Swagger2Parameter | Swagger2Ref)[],
    resolver: TypeResolver<GraphQLType>): Promise<GraphQLFieldConfigArgumentMap | undefined> {

    if (parameters.length === 0) return;

    const ret: GraphQLFieldConfigArgumentMap = {};
    for (const param of parameters) {
        if (isRef(param)) continue; //FIXME need to deal with reference parameters
        const info = await getParameterInfo(param, resolver);
        if (!isInputType(info.type)) {
            throw new Error(`Non-input type '${info.type.name}'`
                + ` for parameter '${param.name}' in ${operationId}`);
        }
        ret[param.name] = {
            type: (info.required ? new GraphQLNonNull(info.type) : info.type) as GraphQLInputType
        };
    }
    return ret;
}

async function buildQueryField(
    op: Swagger2Operation,
    itemParams: (Swagger2Parameter | Swagger2Ref)[] | undefined,
    resolver: TypeResolver<GraphQLType>): Promise<GraphQLFieldConfig<unknown, unknown>> {
    const iparams = itemParams ? itemParams : [];
    const oparams = op.parameters ? op.parameters : [];
    return {
        type: GraphQLString, //FIXME(manishv) put actual result type here
        args: await buildArgsForOperation(op.operationId, [...iparams, ...oparams], resolver)
    };
}

async function buildQueryFields(
    swagger: Swagger2,
    resolver: TypeResolver<GraphQLType>): Promise<GraphQLFieldConfigMap<unknown, unknown>> {

    const ret: { [field: string]: any } = {}; //FIXME(manishv)  What is the type of a field?
    for (const swagPath in swagger.paths) {
        if (!Object.hasOwnProperty.call(swagger.paths, swagPath)) continue;
        const pathItem = swagger.paths[swagPath];
        const op = pathItem.get;
        if (op === undefined) continue;
        if (op.operationId === undefined) continue; //FIXME(manishv) should we compute a name here?
        ret[op.operationId] = await buildQueryField(op, pathItem.parameters, resolver);
    }
    return ret;
}

async function buildQueryObject(swagger: Swagger2): Promise<GraphQLObjectType> {
    const resolver = new TypeResolver<GraphQLType>();
    resolver.addListener("needType", (res, tyName) => {
        try {
            res.addType(tyName, resolveType(swagger, tyName));
        } catch (e) {
            res.resolveError(tyName, e);
        }
    });
    populateBasicSwaggerTypes(resolver);

    const fields = await buildQueryFields(swagger, resolver);
    return new GraphQLObjectType({
        name: "Query",
        fields
    });
}

export async function buildGraphQLSchema(swagger: Swagger2): Promise<GraphQLSchema> {
    const qobj = await buildQueryObject(swagger);
    const schema = new GraphQLSchema({ query: qobj });
    return schema;
}
