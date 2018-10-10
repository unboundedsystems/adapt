import * as fs from "fs-extra";
import { GraphQLError, printSchema } from "graphql";
import { makeExecutableSchema } from "graphql-tools";
import * as path from "path";
import * as should from "should";
import swagger2gql from "../../src/swagger2gql";
import {
    Swagger2,
    Swagger2PathItem,
    Swagger2Schema
} from "../../src/swagger2gql/swagger_types";

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

function makeSimpleGetSwagger(responseSchema: Swagger2Schema) {
    return makeSwagger({
        "/api": {
            get: {
                operationId: "getApi",
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

describe("Swagger to GraphQL Tests (with Kubernetes 1.8 spec)", function () {
    this.timeout(30000);
    it("Should convert kubernetes 1.8 swagger specification and reparse schema", async () => {
        const swaggerJSON = await fs.readFile(path.join("/src/cloud/test/swagger2gql/kubernetes-1.8-swagger.json"));
        const schema = swagger2gql(swaggerJSON.toString());
        should(schema).not.Undefined();
        should(schema).not.Null();
        const schemaTxt = printSchema(schema);

        reportGraphQLError(schemaTxt, (s) => makeExecutableSchema({ typeDefs: s }));
    });
});
