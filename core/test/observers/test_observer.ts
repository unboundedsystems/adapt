import * as uutil from "@adpt/utils";
import * as fs from "fs";
import {
    GraphQLSchema,
} from "graphql";
import { makeExecutableSchema } from "graphql-tools";
import * as ld from "lodash";
import * as path from "path";
import { Foo, QueryResolvers } from "../../generated/test/observers/test_observer_schema_types";
import { ObserverPlugin } from "../../src/observers";

export const modelData = {
    foos: (Array(10).fill(undefined).map((_, i) => ({
        id: i.toString(),
        payload: [i.toString(), (i + 1).toString()]
    }))),
};

const graphqlFilename = path.join(__dirname, "test_observer.graphql");
const schemaStr = fs.readFileSync(graphqlFilename).toString();
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

function rotate<T>(x: T[], amt: number): T[] {
    if (x.length === 0) return ld.clone(x);
    const normAmt = amt % x.length;
    const prefix = x.slice(0, normAmt);
    const suffix = x.slice(normAmt);
    return suffix.concat(prefix);
}

let rotation = 0;
const rotatingPayloadResolvers = {
    Query: {
        fooById: id<QueryResolvers.FooByIdResolver<Foo | null, typeof modelData, null>>(
            async (obj, args, _context, _info) => {
                await uutil.sleep(0);
                let ret = obj.foos.find((foo) => foo.id.toString() === args.id);
                if (ret === undefined) return null;
                ret = ld.cloneDeep(ret);
                ret.payload = rotate(ret.payload, rotation);
                rotation++;
                return ret;
            })
    }
};

abstract class BaseTestObserver implements ObserverPlugin<typeof modelData, typeof modelData> {
    abstract get schema(): GraphQLSchema;

    async observe() {
        return {
            data: modelData,
            context: modelData
        };
    }
}
export class TestObserver extends BaseTestObserver {
    static schema_ = makeExecutableSchema({
        typeDefs: schemaStr,
        resolvers
    });

    get schema(): GraphQLSchema {
        return TestObserver.schema_;
    }
}

export class RotatingPayloadTestObserver extends BaseTestObserver {
    static schema_ = makeExecutableSchema({
        typeDefs: schemaStr,
        resolvers: rotatingPayloadResolvers
    });

    get schema(): GraphQLSchema {
        return RotatingPayloadTestObserver.schema_;
    }
}
