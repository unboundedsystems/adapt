import * as uutil from "@usys/utils";
import * as fs from "fs";
import {
    GraphQLSchema,
    validateSchema as gqlValidateSchema
} from "graphql";
import { makeExecutableSchema } from "graphql-tools";
import * as should from "should";
import { Foo, QueryResolvers } from "../../generated/observers/test_observer_schema_types";
import { Observer } from "../../src/observers";

export const modelData = {
    foos: (Array(10).fill(undefined).map((_, i) => ({
        id: i.toString(),
        payload: i.toString()
    }))),
};

const schemaStr = fs.readFileSync(require.resolve("./test_observer.graphql")).toString();
function id<T>(x: T): T { return x; }

const resolvers = {
    Query: {
        fooById: id<QueryResolvers.FooByIdResolver<Foo | null, typeof modelData, null>>(
            async (obj, args, _context, _info) => {
                await uutil.sleep(0);
                const ret = obj.foos.find((foo) => foo.id.toString() === args.id);
                return ret === undefined ? null : ret;
            })
    }
};

const schema = makeExecutableSchema({
    typeDefs: schemaStr,
    resolvers
});

export class TestObserver implements Observer<typeof modelData, typeof modelData> {
    get schema(): GraphQLSchema {
        return schema;
    }

    constructor() {
        const errors = gqlValidateSchema(schema);
        should(errors).eql([]);
    }

    async observe() {
        return {
            data: modelData,
            context: modelData
        };
    }
}
