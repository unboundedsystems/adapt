/*
 * Copyright 2019 Unbounded Systems, LLC
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

import Adapt, { Group, handle } from "@adpt/core";
import should from "should";
import { mergeEnvSimple } from "../../src";
import { PostgresProvider } from "../../src/postgres";
import { ConnectConsumer, doBuild, EnvRef } from "../testlib";

describe("PostgresProvider tests", () => {
    it("Should expose PG variables in environment", async () => {
        const pg = handle();
        const env: EnvRef = {};
        const orig = <Group>
            <PostgresProvider handle={pg}
                host="host"
                user="user"
                password="password"
                database="db"
            />
            <ConnectConsumer envRef={env} connectTo={pg} />
        </Group>;
        await doBuild(orig);

        should(mergeEnvSimple(env.env)).eql({
            PGHOST: "host",
            PGDATABASE: "db",
            PGPASSWORD: "password",
            PGUSER: "user"
        });
    });
});
