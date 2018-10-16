import { gql } from "@usys/adapt";
import { execute, GraphQLError, GraphQLResolveInfo, printSchema } from "graphql";
import { makeExecutableSchema } from "graphql-tools";
import * as ld from "lodash";
import * as should from "should";
import swagger2gql from "../../src/swagger2gql";
import {
    Swagger2,
    Swagger2PathItem,
    Swagger2Schema
} from "../../src/swagger2gql/swagger_types";
import k8sSwagger = require("./kubernetes-1.8-swagger.json");

function lineWithContext(txt: string, lineNo: number): string {
    const contextAmt = 10;
    const allLines = txt.split(/\r?\n/);
    const rawLines = allLines.slice(lineNo - contextAmt, lineNo + contextAmt);
    const lines = rawLines.map((l, i) => (lineNo - contextAmt + i + 1).toString() + ": " + l);
    return lines.join("\n");
}

function reportGraphQLError<Ret>(txt: string, f: (txt: string) => Ret): Ret {
    try {
        return f(txt);
    } catch (e) {
        if (!(e instanceof GraphQLError)) throw e;
        const locations = e.locations;
        if (locations === undefined) throw e;
        let msg = e.toString() + "\n\n";
        for (const loc of locations) {
            msg += lineWithContext(txt, loc.line) + "\n\n";
        }
        throw new Error(msg);
    }
}

function makeSwagger(
    paths: { [path: string]: Swagger2PathItem },
    definitions?: { [name: string]: Swagger2Schema }): Swagger2 {
    return {
        swagger: "2.0",
        info: {
            title: "Test spec",
            version: "1.0"
        },
        paths,
        definitions
    };
}

function makeSimpleGetSwagger(responseSchema: Swagger2Schema, apiPath: string = "/api", apiOp: string = "getApi") {
    return makeSwagger({
        [apiPath]: {
            get: {
                operationId: apiOp,
                responses: {
                    ["200"]: {
                        description: "API response",
                        schema: responseSchema
                    }
                }
            }
        }
    });
}

function makeMultiGetSwagger(paths: { path: string, op: string, responseSchema: Swagger2Schema }[]): Swagger2 {
    const ret: Swagger2 = {
        swagger: "2.0",
        info: {
            title: "Test spec",
            version: "1.0"
        },
        paths: {}
    };
    for (const p of paths) {
        const s = makeSimpleGetSwagger(p.responseSchema, p.path, p.op);
        ld.merge(ret, s);
    }
    return ret;
}

describe("Swagger to GraphQL Tests (simple)", () => {
    it("Should convert with primitive response type", () => {
        const swagger = makeSimpleGetSwagger({ type: "string" });

        const schema = swagger2gql(swagger);
        should(schema).not.Null();
        should(schema).not.Undefined();
        const schemaTxt = printSchema(schema);

        should(schemaTxt).match(/getApi: String/);
    });

    it("Should convert with inline object response type", () => {
        const swagger = makeSimpleGetSwagger({
            type: "object",
            required: ["bar"],
            properties: {
                foo: { type: "string" },
                bar: { type: "integer" }
            }
        });

        const schema = swagger2gql(swagger);
        should(schema).not.Null();
        should(schema).not.Undefined();
        const schemaTxt = printSchema(schema);

        should(schemaTxt).match(/getApi: getApi_Response/);
        should(schemaTxt).match(/foo: String/);
        should(schemaTxt).match(/bar: Int!/);
    });

    it("Should convert with inline parameter types", () => {
        const swagger = makeSimpleGetSwagger({ type: "string" });
        swagger.paths["/api"].get!.parameters = [
            { name: "foo", in: "query", type: "integer", default: 3 },
            { name: "bar", in: "query", type: "integer", required: true }
        ];

        const schema = swagger2gql(swagger);
        should(schema).not.Null();
        should(schema).not.Undefined();
        const schemaTxt = printSchema(schema);

        should(schemaTxt).match(/getApi\(foo: Int = 3, bar: Int!\): String/);
    });

    it("Should convert with $ref parameter spec"); //Not supported yet

    it("Should convert with $ref response spec"); //Tested by k8s test cases below, add smaller tests in future here
});

describe("Swagger to GraphQL Tests (with resolvers)", () => {
    it("Should resolve single field", async () => {
        const swagger = makeSimpleGetSwagger({ type: "integer" });
        swagger.paths["/api"].get!.parameters = [
            { name: "foo", in: "query", type: "integer", default: 3 }
        ];

        const schema = swagger2gql(swagger, {
            fieldResolvers: (_type, fieldName) => {
                if (fieldName !== "getApi") throw new Error("fieldResolvers called for extraneous field");
                return (_obj: unknown, args: { foo: number }, _context: unknown, _info: GraphQLResolveInfo) => {
                    return args.foo + 1;
                };
            }
        });

        const result17 = execute(schema, gql`query { getApi(foo: 17) }`);
        should(ld.cloneDeep(result17)).eql({ data: { getApi: 18 } });

        const resultDefault = execute(schema, gql`query { getApi }`);
        should(ld.cloneDeep(resultDefault)).eql({ data: { getApi: 4 } });
    });

    it("Should resolve multiple fields", async () => {
        const swagger = makeMultiGetSwagger([
            { path: "/api/plus1", op: "plus1", responseSchema: { type: "integer" } },
            { path: "/api/square", op: "square", responseSchema: { type: "integer" } }
        ]);
        swagger.paths["/api/plus1"].get!.parameters = [
            { name: "addend", in: "query", type: "integer", default: 7 }
        ];
        swagger.paths["/api/square"].get!.parameters = [
            { name: "base", in: "query", type: "integer", default: 3 }
        ];

        const schema = swagger2gql(swagger, {
            fieldResolvers: (_type, fieldName) => {
                switch (fieldName) {
                    case "plus1":
                        return (_obj, args: { addend: number }, _context, _info) => {
                            return args.addend + 1;
                        };
                    case "square":
                        return (_obj, args: { base: number }, _context, _info) => {
                            return args.base * args.base;
                        };
                    default:
                        throw new Error("fieldResolvers called for extraneous field: " + fieldName);
                }
            }
        });

        const resultPlus1 = execute(schema, gql`query { plus1(addend: 17) }`);
        should(ld.cloneDeep(resultPlus1)).eql({ data: { plus1: 18 } });

        const resultSquareDefault = execute(schema, gql`query { square }`);
        should(ld.cloneDeep(resultSquareDefault)).eql({ data: { square: 9 } });
    });
});

describe("Swagger to GraphQL Tests (with Kubernetes 1.8 spec)", function () {
    this.timeout(30000);
    it("Should convert kubernetes 1.8 swagger specification and reparse schema", async () => {
        const schema = swagger2gql(k8sSwagger);
        should(schema).not.Undefined();
        should(schema).not.Null();
        const schemaTxt = printSchema(schema);

        reportGraphQLError(schemaTxt, (s) => makeExecutableSchema({ typeDefs: s }));
    });
});
