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

import { gql } from "@adpt/core";
import express = require("express");
import { Express } from "express";
import { execute, GraphQLError, GraphQLResolveInfo, GraphQLSchema, printSchema } from "graphql";
import { makeExecutableSchema } from "graphql-tools";
import * as http from "http";
import * as https from "https";
import * as ld from "lodash";
import fetch from "node-fetch";
import should from "should";
import { Kubeconfig } from "../../src/k8s/common";
import { authHeaders, getK8sConnectInfo } from "../../src/k8s/k8s_observer";
import k8sSwagger = require("../../src/k8s/kubernetes-1.8-swagger.json");
import swagger2gql, { ResolverFactory } from "../../src/swagger2gql";
import {
    Swagger2,
    Swagger2PathItem,
    Swagger2Schema
} from "../../src/swagger2gql/swagger_types";
import { mkInstance } from "../run_minikube";

// tslint:disable-next-line:no-var-requires
const swaggerClient = require("swagger-client");

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

function swaggerResolverFactory(spec: Swagger2, host: string, agent?: https.Agent,
    headers?: { [index: string]: string }): ResolverFactory {
    return {
        fieldResolvers: (_type, fieldName, isQuery) => {
            if (!isQuery) return;
            return async (_obj, args, _context, _info) => {
                const req = await swaggerClient.buildRequest({
                    spec,
                    operationId: fieldName,
                    parameters: args,
                    requestContentType: "application/json",
                    responseContentType: "application/json"
                });

                const url = host + req.url;
                const resp = await fetch(url, { ...req, agent, headers });
                if (resp.status !== 200) {
                    throw new Error(`Error status ${resp.statusText}(${resp.status}): ${resp.body}`);
                }

                return resp.json();
            };
        }
    };
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

    it("Should detect invalid swagger files", () => {
        should(() => swagger2gql({})).throwError();
        //make sure cached status is valid
        should(() => swagger2gql({})).throwError();
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

        const result17 = await execute(schema, gql`query { getApi(foo: 17) }`);
        should(ld.cloneDeep(result17)).eql({ data: { getApi: 18 } });

        const resultDefault = await execute(schema, gql`query { getApi }`);
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

        const resultPlus1 = await execute(schema, gql`query { plus1(addend: 17) }`);
        should(ld.cloneDeep(resultPlus1)).eql({ data: { plus1: 18 } });

        const resultSquareDefault = await execute(schema, gql`query { square }`);
        should(ld.cloneDeep(resultSquareDefault)).eql({ data: { square: 9 } });
    });
});

describe("Swagger to GraphQL Tests (with Kubernetes 1.8 spec)", () => {
    let schema: GraphQLSchema;
    before(async function () {
        this.timeout(30 * 1000 + mkInstance.setupTimeoutMs);
        const kubeconfig = await mkInstance.kubeconfig;
        const info = getK8sConnectInfo(kubeconfig as Kubeconfig);
        const agent = new https.Agent({
            key: info.key,
            cert: info.cert,
            ca: info.ca,
        });
        const host = info.url;
        const headers = authHeaders(info);
        schema = swagger2gql(
            k8sSwagger,
            swaggerResolverFactory(k8sSwagger, host, agent, headers));
    });

    it("Should convert and reparse schema", async () => {
        should(schema).not.Undefined();
        should(schema).not.Null();
        const schemaTxt = printSchema(schema);

        reportGraphQLError(schemaTxt, (s) => makeExecutableSchema({ typeDefs: s }));
    });

    it("Should convert and fetch running pods", async () => {
        const result = await execute(schema,
            gql`query {
                listCoreV1NamespacedPod(namespace: "kube-system") {
                    kind
                    items { metadata { name } }
                }
            }`);
        should(result.errors).Undefined();

        const data = result.data;
        if (data == null) throw should(data).be.ok();

        const pods = data.listCoreV1NamespacedPod;
        if (pods === undefined) return should(pods).not.Undefined();
        should(pods.kind).equal("PodList");

        const items = pods.items as ({ metadata?: { name?: string } } | undefined)[];
        if (items === undefined) return should(items).not.Undefined();
        if (!ld.isArray(items)) return should(items).Array();

        for (const item of items) {
            if (item === undefined) return should(item).not.Undefined();
            const meta = item.metadata;
            if (meta === undefined) return should(meta).not.Undefined();
            const name = meta.name;
            if (name === undefined) return should(name).not.Undefined();
            const re = /(^(?:kube-dns)|(?:kube-addon-manager)|(?:storage-provisioner)|(?:coredns))-[a-z\-0-9]+$/;
            return should(name).match(re);
        }
        should(items.length).equal(3);
    });
});

describe("Swagger to GraphQL remote query tests", () => {
    let mockServer: http.Server;
    let mockApp: Express;
    let mockHost: string;

    const mockSwagger: Swagger2 = {
        swagger: "2.0",
        info: {
            title: "Test spec",
            version: "1.0"
        },
        paths: {
            "/api/plus1": {
                get: {
                    operationId: "plus1",
                    produces: ["application/json"],
                    parameters: [{
                        name: "addend",
                        in: "query",
                        type: "integer"
                    }],
                    responses: {
                        ["200"]: { description: "Addend + 1", schema: { type: "integer" } },
                        ["400"]: { description: "Bad Request", schema: { type: "string" } }
                    }
                }
            },
            "/api/square": {
                get: {
                    operationId: "square",
                    produces: ["application/json"],
                    parameters: [{
                        name: "base",
                        in: "query",
                        type: "integer"
                    }],
                    responses: {
                        ["200"]: { description: "Base squared", schema: { type: "integer" } },
                        ["400"]: { description: "Bad Request", schema: { type: "string" } }
                    }
                }
            }
        }
    };

    beforeEach(async () => {
        mockApp = express();
        mockApp.get("/api/plus1", (req, res) => {
            const addendString = req.query.addend ? req.query.addend : "7";
            const addend = Number(addendString);
            if (Number.isNaN(addend)) {
                res.status(400).json("Must have numeric addend");
            } else {
                res.status(200).json(addend + 1);
            }
            res.end();
        });

        mockApp.get("/api/square", (req, res) => {
            const baseString = req.query.base ? req.query.base : "3";
            const base = Number(baseString);
            if (Number.isNaN(base)) {
                res.status(400).send("Must have numeric addend");
            } else {
                res.json(base * base);
            }
            res.end();
        });

        mockServer = http.createServer(mockApp);
        await new Promise((res, rej) => mockServer.listen((err: Error) => err ? rej(err) : res()));
        const addr = mockServer.address();
        if (typeof addr === "string") throw new Error(`Expected an object`);
        mockHost = "http://localhost:" + addr.port.toString();
    });

    afterEach(async () => {
        await new Promise((res, rej) => mockServer.close((err: Error) => err ? rej(err) : res()));
    });

    it("Server baseline (no graphql)", async () => {
        //This is just a baseline to make sure the server setup is working.
        //Doesn't test the library but is useful for diagnosing other test failures
        const req = await swaggerClient.buildRequest({
            spec: mockSwagger,
            operationId: "plus1",
            parameters: { addend: 17 },
            requestContentType: "application/json",
            responseContentType: "application/json"
        });

        const url = mockHost + req.url;

        // tslint:disable-next-line:no-object-literal-type-assertion
        const resp = await fetch(url, req);
        should(resp.status).equal(200);
        should(await resp.json()).equal(18);
    });

    it("Should connect to server and get data", async () => {
        const schema = swagger2gql(mockSwagger, swaggerResolverFactory(mockSwagger, mockHost));

        const resultPlus1 = await execute(schema, gql`query { plus1(addend: 3) }`);
        should(ld.cloneDeep(resultPlus1)).eql({ data: { plus1: 4 } });

        const resultSquare = await execute(schema, gql`query { square(base: 5) }`);
        should(ld.cloneDeep(resultSquare)).eql({ data: { square: 25 } });
    });
});
