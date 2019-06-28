//FIXME(manishv), this mock is here becuase it is needed in cli as well, and testutils cannot depend on Adapt.
//At some point we should have a different package for these kinds of things.
//Alternatively, this should become some sort of generic observer that makes it easier to write observers
//that follow a certain pattern.

import * as uutil from "@adpt/utils";
import * as fs from "fs";
import {
    execute as gqlExecute,
    GraphQLSchema
} from "graphql";
import { makeExecutableSchema } from "graphql-tools";
import * as path from "path";
import { ExecutedQuery, ObserverNeedsData, ObserverPlugin, ObserverResponse } from ".";

import { MockObject, QueryResolvers } from "../../generated/src/observers/mock_observer_schema_types";
import { registerObserver } from "./registry";

const schemaFile = path.join(__dirname, "mock_observer.graphql");
const schemaStr = fs.readFileSync(schemaFile).toString();

function forceType<T>(x: T): T { return x; }

interface CachedData {
    mockObjects: (Partial<MockObject> & { id: string, numericId: number })[];
}

//Resolve data from previously fetched results.
const queryCacheResolvers = {
    Query: {
        mockById: forceType<
            QueryResolvers.MockByIdResolver<MockObject | null | undefined,
            null,
            CachedData | undefined>>(
                async (_obj, args, cache, _info) => {
                    await uutil.sleep(0);
                    const ret = cache ? cache.mockObjects.find((o) => o.id === args.id) : undefined;
                    if (ret !== undefined) return ret;

                    //Can there be such an object?
                    const id = Number(args.id);
                    if (Number.isNaN(id)) return null; //No such object
                    if (Math.floor(id) !== id) return null;

                    throw new ObserverNeedsData();
                }),
    }
};

//Fetch data needed for specified quereis
//There is a MockObject for every integer id
const observeResolvers = {
    Query: {
        mockById:
            forceType<QueryResolvers.MockByIdResolver<{ id: string, numericId: number } | null, null, CachedData>>(
                async (_obj, args, cache, _info) => {
                    await uutil.sleep(0);
                    const id = Number(args.id);
                    await uutil.sleep(Math.min(id, 10)); //Ensure some deterministic delay between 0 and 10 ms
                    if (Number.isNaN(id)) return null; //No such object
                    if (Math.floor(id) !== id) return null;

                    let ret = cache.mockObjects.find((o) => o.id === args.id);
                    if (ret === undefined) {
                        ret = { id: id.toString(), numericId: id };
                        cache.mockObjects.push(ret);
                    }
                    return ret;
                }
            )
    },

    MockObject: {
        idSquared:
            forceType<QueryResolvers.MockByIdResolver<number, Partial<MockObject> & { numericId: number }, null>>(
                async (obj, _args, _context, _info) => {
                    obj.idSquared = obj.numericId * obj.numericId;
                    return obj.idSquared;
                }
            ),
        idPlusOne:
            forceType<QueryResolvers.MockByIdResolver<number, Partial<MockObject> & { numericId: number }, null>>(
                async (obj, _args, _context, _info) => {
                    obj.idPlusOne = obj.numericId + 1;
                    return obj.idPlusOne;
                }
            )
    }
};

export class MockObserver implements ObserverPlugin {
    static observerName: string;

    static schema_ = makeExecutableSchema({
        typeDefs: schemaStr,
        resolvers: queryCacheResolvers
    });

    static fetchSchema_ = makeExecutableSchema({
        typeDefs: schemaStr,
        resolvers: observeResolvers
    });

    constructor(public neverObserve: boolean = false) { }

    get schema(): GraphQLSchema {
        return MockObserver.schema_;
    }

    observe = async (possibleQueries: ExecutedQuery[]): Promise<ObserverResponse<undefined, CachedData>> => {
        const cache: CachedData = { mockObjects: [] };
        if (!this.neverObserve) {
            const waitFor = possibleQueries.map((q) =>
                Promise.resolve(gqlExecute(MockObserver.fetchSchema_, q.query, null, cache, q.variables)));
            await Promise.all(waitFor);
        }
        return { context: cache };
    }
}

export default MockObserver;

registerObserver(new MockObserver());
