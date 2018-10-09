import {
    GraphQLBoolean,
    GraphQLFieldConfig,
    GraphQLFieldConfigArgumentMap,
    GraphQLFieldConfigMap,
    GraphQLFloat,
    GraphQLInputObjectType,
    GraphQLInputType,
    GraphQLInt,
    GraphQLList,
    GraphQLNonNull,
    GraphQLObjectType,
    GraphQLOutputType,
    GraphQLSchema,
    GraphQLString
} from "graphql";

import * as util from "util";
import {
    isRef,
    Swagger2,
    Swagger2Operation,
    Swagger2Parameter,
    Swagger2Ref,
    Swagger2Schema
} from "../../src/swagger2gql/swagger_types";
import { TypeResolver } from "../../src/swagger2gql/type_resolver";

interface LTypeResolver {
    input: TypeResolver<GraphQLInputType>;
    output: TypeResolver<GraphQLOutputType>;
}

function isComplexType(schema: Swagger2Schema): boolean {
    return schema.type === "object" || schema.type === "array";
}

interface Fields<T> {
    [name: string]: {
        description?: string;
        type: T;
    };
}

function buildFieldsFromSchema(
    baseName: string,
    schema: Swagger2Schema,
    tyResolver: LTypeResolver,
    inputType: true): () => Fields<GraphQLInputType>;
function buildFieldsFromSchema(
    baseName: string,
    schema: Swagger2Schema,
    tyResolver: LTypeResolver,
    inputType: false): () => Fields<GraphQLOutputType>;
function buildFieldsFromSchema(
    baseName: string,
    schema: Swagger2Schema,
    tyResolver: LTypeResolver,
    inputType: boolean): () => Fields<GraphQLInputType | GraphQLOutputType>;
function buildFieldsFromSchema(
    baseName: string,
    schema: Swagger2Schema,
    tyResolver: LTypeResolver,
    inputType: boolean): () => Fields<GraphQLInputType | GraphQLOutputType> {

    if (schema.additionalProperties) throw new Error("additionalProperties not yet supported");
    const properties = schema.properties;
    if (properties === undefined) return () => ({});

    const ret: Fields<GraphQLInputType | GraphQLOutputType> = {};
    for (const propName in properties) {
        if (!Object.hasOwnProperty.call(properties, propName)) continue;
        ret[propName] = {
            description: schema.description,
            type: jsonSchema2GraphQLType(baseName + "_" + propName, schema, tyResolver, inputType)
        };
    }
    return () => ret;
}

function jsonSchema2GraphQLType(
    name: string,
    schema: Swagger2Schema,
    tyResolver: LTypeResolver,
    inputType: true): GraphQLInputType;
function jsonSchema2GraphQLType(
    name: string,
    schema: Swagger2Schema,
    tyResolver: LTypeResolver,
    inputType: false): GraphQLOutputType;
function jsonSchema2GraphQLType(
    name: string,
    schema: Swagger2Schema,
    tyResolver: LTypeResolver,
    inputType: boolean): GraphQLInputType | GraphQLOutputType;
function jsonSchema2GraphQLType(
    name: string,
    schema: Swagger2Schema,
    tyResolverIn: LTypeResolver,
    inputType: boolean): GraphQLInputType | GraphQLOutputType {

    const tyResolver = inputType ? tyResolverIn.input : tyResolverIn.output;

    if (schema.type === "array") {
        const items = schema.items;
        if (!items) throw new Error(`Saw array schema with no items: ${util.inspect(schema)}`);
        if (isRef(items)) {
            return new GraphQLList(tyResolver.getType(items.$ref));
        }
        if (isComplexType(items)) {
            return new GraphQLList(jsonSchema2GraphQLType(name, items, tyResolverIn, inputType));
        }
        return new GraphQLList(tyResolver.getType(items.type));
    }

    const consArgs = {
        name,
        description: schema.description,
    };
    if (inputType) {
        const fields = buildFieldsFromSchema(name, schema, tyResolverIn, true);
        return new GraphQLInputObjectType({ ...consArgs, fields });
    } else {
        //FIXME(manishv) attach resolvers somewhere
        const fields = buildFieldsFromSchema(name, schema, tyResolverIn, false);
        return new GraphQLObjectType({ ...consArgs, fields });
    }
}

function getDef(schema: Swagger2, tyName: string) {
    if (!tyName.startsWith("#/definitions/")) return;
    const defs = schema.definitions;
    if (!defs) return;
    const baseTyName = tyName.replace("#/definitions/", "");
    return defs[baseTyName];
}

function resolveType(
    swagger: Swagger2,
    tyName: string,
    tyResolver: LTypeResolver,
    input: true): GraphQLInputType;
function resolveType(
    swagger: Swagger2,
    tyName: string,
    tyResolver: LTypeResolver,
    input: false): GraphQLOutputType;
function resolveType(
    swagger: Swagger2,
    tyName: string,
    tyResolver: LTypeResolver,
    input: boolean): GraphQLInputType | GraphQLOutputType;
function resolveType(swagger: Swagger2, tyName: string, tyResolver: LTypeResolver, input: boolean) {
    const schema = getDef(swagger, tyName);
    if (schema === undefined) throw new Error(`Unable to find type '${tyName}'`);
    return jsonSchema2GraphQLType(tyName, schema, tyResolver, input);
}

function populateBasicSwaggerTypes(tyResolver: LTypeResolver) {
    tyResolver.input.addType("integer", GraphQLInt);
    tyResolver.input.addType("number", GraphQLFloat);
    tyResolver.input.addType("string", GraphQLString);
    tyResolver.input.addType("boolean", GraphQLBoolean);
    tyResolver.output.addType("integer", GraphQLInt);
    tyResolver.output.addType("number", GraphQLFloat);
    tyResolver.output.addType("string", GraphQLString);
    tyResolver.output.addType("boolean", GraphQLBoolean);
}

function getParameterInfo(
    param: Swagger2Parameter,
    tyResolver: LTypeResolver) {
    if (param.in === "body") {
        throw new Error("Body parameters not supported");
    } else {
        return {
            type: tyResolver.input.getType(param.type),
            required: param.required ? param.required : false,
            default: param.default
        };
    }
}

function buildArgsForOperation(
    _operationId: string | undefined,
    parameters: (Swagger2Parameter | Swagger2Ref)[],
    tyResolver: LTypeResolver): GraphQLFieldConfigArgumentMap | undefined {

    if (parameters.length === 0) return;

    const ret: GraphQLFieldConfigArgumentMap = {};
    for (const param of parameters) {
        if (isRef(param)) continue; //FIXME need to deal with reference parameters
        const info = getParameterInfo(param, tyResolver);
        ret[param.name] = {
            type: (info.required ? new GraphQLNonNull(info.type) : info.type) as GraphQLInputType
        };
    }
    return ret;
}

function responseTypeForOperation(
    op: Swagger2Operation,
    tyResolver: LTypeResolver): GraphQLOutputType {

    const okResponse = op.responses["200"]; //FIXME(manishv) deal with other non-error responses here
    if (okResponse === undefined) throw new Error(`Operation ${op.operationId} does not have 200 response`);
    const schema = okResponse.schema;
    if (schema === undefined) return GraphQLString; //FIXME(manishv) This should be the JSON scalar type, not a string
    if (isRef(schema)) {
        return tyResolver.output.getType(schema.$ref);
    } else {
        throw new Error("Non-reference types for responses not yet supported");
    }
}

function buildQueryField(
    op: Swagger2Operation,
    itemParams: (Swagger2Parameter | Swagger2Ref)[] | undefined,
    tyResolver: LTypeResolver): GraphQLFieldConfig<unknown, unknown> {
    const iparams = itemParams ? itemParams : [];
    const oparams = op.parameters ? op.parameters : [];
    return {
        type: responseTypeForOperation(op, tyResolver), //FIXME(manishv) put actual result type here
        args: buildArgsForOperation(op.operationId, [...iparams, ...oparams], tyResolver)
    };
}

function buildQueryFields(
    swagger: Swagger2,
    tyResolver: LTypeResolver): GraphQLFieldConfigMap<unknown, unknown> {

    const ret: { [field: string]: any } = {}; //FIXME(manishv)  What is the type of a field?
    for (const swagPath in swagger.paths) {
        if (!Object.hasOwnProperty.call(swagger.paths, swagPath)) continue;
        const pathItem = swagger.paths[swagPath];
        const op = pathItem.get;
        if (op === undefined) continue;
        if (op.operationId === undefined) continue; //FIXME(manishv) should we compute a name here?
        ret[op.operationId] = buildQueryField(op, pathItem.parameters, tyResolver);
    }
    return ret;
}

function buildQueryObject(swagger: Swagger2): GraphQLObjectType {
    const tyResolver: LTypeResolver = {
        input: new TypeResolver<GraphQLInputType>((n) => resolveType(swagger, n, tyResolver, true)),
        output: new TypeResolver<GraphQLOutputType>((n) => resolveType(swagger, n, tyResolver, false))
    };

    populateBasicSwaggerTypes(tyResolver);

    const fields = buildQueryFields(swagger, tyResolver);
    return new GraphQLObjectType({
        name: "Query",
        fields
    });
}

export function buildGraphQLSchema(swagger: Swagger2): GraphQLSchema {
    const qobj = buildQueryObject(swagger);
    const schema = new GraphQLSchema({ query: qobj });
    return schema;
}
