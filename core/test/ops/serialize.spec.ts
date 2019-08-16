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

import { print as gqlPrint } from "graphql";
import should from "should";
import { gql } from "../../src/observers";
import {
    parseFullObservationsJson,
    stringifyFullObservations
} from "../../src/ops/serialize";

describe("Full Observation Serialization Test", () => {
    it("Should serialize {}", () => {
        should(JSON.parse(stringifyFullObservations({}))).eql({});
    });

    it("Should deserialize {}", () => {
        should(parseFullObservationsJson("{}")).eql({});
    });

    it("Should deserialize with no observers but plugin data", () => {
        const ref = {
            plugin: { foo: { bar: 1 } }
        };
        const json = JSON.stringify(ref);

        should(parseFullObservationsJson(json)).eql(ref);
    });

    it("Should serialize/deserialize and reconstitute observer with no plugin data", () => {
        const query = gql`query Bar { x(y: $z) }`;
        const ref = {
            observer: {
                foo: {
                    observations: {
                        data: { baz: 1 }
                    },
                    queries: [{ query, variables: { z: 2 } }]
                }
            }
        };

        const json = stringifyFullObservations(ref);
        const parsed = parseFullObservationsJson(json);
        should(parsed.observer).not.Undefined();
        should(parsed.observer!.foo).not.Undefined();
        should(parsed.observer!.foo.queries).not.Undefined();
        should(parsed.observer!.foo.queries.length).equal(1);

        const parsedQuery = parsed.observer!.foo.queries[0].query;
        should(gqlPrint(parsedQuery)).eql(gqlPrint(query));

        parsed.observer!.foo.queries[0].query = query;
        should(parsed).eql(ref);
    });
});
