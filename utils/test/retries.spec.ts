/*
 * Copyright 2020 Unbounded Systems, LLC
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

import should from "should";

import { makeRetryDelay, rand, RetryDelay } from "../src/retries";

describe("rand", () => {
    it("Should generate numbers between min and max", () => {
        for (let i = 0; i < 100000; i++) {
            const r = rand(1, 2);
            should(r).be.within(1, 2);
        }
    });
});

describe("makeRetryDelay", () => {
    function getRetries(f: RetryDelay, n: number) {
        const ret = [];
        for (let i = 0; i < n; i++) {
            ret.push(f(i));
        }
        return ret;
    }

    it("Should not retry when retries is 0", () => {
        const delay = makeRetryDelay({ retries: 0 });
        should(delay(0)).equal(-1);
    });

    it("Should generate retries for defaults without random", () => {
        const delay = makeRetryDelay({ randomize: false });
        should(getRetries(delay, 10)).eql([
            100, 200, 400, 800, 1000, 1000, 1000, 1000, 1000, 1000
        ]);
    });

    it("Should generate retries for defaults", () => {
        const delay = makeRetryDelay({});
        const retries = getRetries(delay, 10);
        should(retries.shift()).be.within(100, 200);  // attempt 0
        should(retries.shift()).be.within(200, 400);  // attempt 1
        should(retries.shift()).be.within(400, 800);  // attempt 2
        should(retries.shift()).be.within(800, 1000); // attempt 3
        should(retries.shift()).be.within(900, 1000); // attempt 4

        should(retries.shift()).be.within(900, 1000); // attempt 5
        should(retries.shift()).be.within(900, 1000); // attempt 6
        should(retries.shift()).be.within(900, 1000); // attempt 7
        should(retries.shift()).be.within(900, 1000); // attempt 8
        should(retries.shift()).be.within(900, 1000); // attempt 9
    });
});
