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

import { execute as gqlExecute, ExecutionResult, GraphQLSchema } from "graphql";
import * as ld from "lodash";
import should from "should";
import { ExecutedQuery, gql, ObserverResponse } from "../../src/observers";
import MockObserver from "../../src/observers/MockObserver";

async function exec<T>(
    schema: GraphQLSchema,
    query: ExecutedQuery,
    obs: ObserverResponse): Promise<ExecutionResult<T>> {

    return gqlExecute<T>(schema, query.query, obs.data, obs.context, query.variables);
}

const query3PlusOne = { query: gql`query { mockById(id: "3") { idPlusOne } }` };
const query4Squared = { query: gql`query { mockById(id: "4") { idSquared } }` };

describe("Mock Observer Observations Tests", () => {
    let mock: MockObserver;

    beforeEach(() => {
        mock = new MockObserver();
    });

    it("Should instantiate", () => {
        should(mock).not.Null();
        should(mock.schema).not.Null();
    });

    it("Should observe minimal data", async () => {
        const obs = await mock.observe([query3PlusOne, query4Squared]);
        if (obs.context === undefined) throw should(obs.context).not.Undefined();
        if (obs.context.mockObjects === undefined) throw should(obs.context.mockObjects).not.Undefined();

        const mock3 = obs.context.mockObjects.find((o) => o.id === "3");
        const mock4 = obs.context.mockObjects.find((o) => o.id === "4");
        if (mock3 === undefined) throw should(mock3).not.Undefined();
        if (mock4 === undefined) throw should(mock4).not.Undefined();

        should(mock3).eql({ id: "3", numericId: 3, idPlusOne: 4 });
        should(mock4).eql({ id: "4", numericId: 4, idSquared: 16 });
    });

    it("Should never observe", async () => {
        const neverMock = new MockObserver(true);
        const obs = await neverMock.observe([query3PlusOne, query4Squared]);
        if (obs.context === undefined) throw should(obs.context).not.Undefined();
        if (obs.context.mockObjects === undefined) throw should(obs.context.mockObjects).not.Undefined();

        const mock3 = obs.context.mockObjects.find((o) => o.id === "3");
        const mock4 = obs.context.mockObjects.find((o) => o.id === "4");
        if (mock3 !== undefined) throw should(mock3).Undefined();
        if (mock4 !== undefined) throw should(mock4).Undefined();
    });
});

describe("Mock Observer Query Tests", () => {
    let mock: MockObserver;
    let obs: ObserverResponse;

    beforeEach(async () => {
        mock = new MockObserver();
        obs = await mock.observe([query3PlusOne, query4Squared]);
    });

    async function lexec<T>(query: ExecutedQuery): Promise<T> {
        const result = await exec<T>(mock.schema, query, obs);
        should(result.errors).Undefined();
        if (result.data == null) throw should(result.data).be.ok();
        return result.data;
    }

    it("Should retrive data from the cache", async () => {
        const q1 = await lexec<{ mockById: { idPlusOne: number } }>(query3PlusOne);
        should(ld.cloneDeep(q1)).eql({ mockById: { idPlusOne: 4 } });

        const q2 = await lexec<{ mockById: { idSquared: number } }>(query4Squared);
        should(ld.cloneDeep(q2)).eql({ mockById: { idSquared: 16 } });
    });

    it("Should have ObserverNeedsData error for data not in the cache", async () => {
        const query = { query: gql`query { mockById(id: "1") { idSquared } }` };
        const q1 = await exec<{ mockById: { idPlusOne: number } }>(mock.schema, query, obs);
        if (q1.errors === undefined) throw should(q1.errors).not.Undefined();
        should(q1.errors.length).equal(1);
        should(q1.errors[0].message).startWith("Adapt Observer Needs Data:");
    });

    it("Should know there is no data for invalid keys", async () => {
        const query = { query: gql`query { mockById(id: "X") { idSquared } }` };
        const q1 = await lexec<{ mockById: { idSquared: number } }>(query);
        should(ld.cloneDeep(q1)).eql({ mockById: null });
    });
});
