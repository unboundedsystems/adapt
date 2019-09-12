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

import { useImperativeMethods } from "@adpt/core";
import { ConnectToInstance } from "../ConnectTo";
import { NetworkScope } from "../NetworkService";

/**
 * An abstract component representing a Postgres database within a Postgres
 * server or service.
 *
 * @remarks
 *
 * Implements the {@link ConnectToInstance} interface.
 *
 * Instance methods:
 *
 * - `connectEnv(scope?: NetworkScope): Environment | undefined`
 *
 *   Returns the set of environment variables that have all the information
 *   needed for a Postgres client to connect to this database. The
 *   returned environment variables are named such that some common Postgres
 *   clients can use them directly:
 *
 *   `PGHOST`: The host to connect to.
 *
 *   `PGDATABASE`: The name of the database.
 *
 *   `PGUSER`: Username to use to authenticate to the database server or service.
 *
 *   `PGPASSWORD`: Password to use to authenticate to the database server or service.
 *
 *   Note that because this component is an abstract component, `connectEnv`
 *   always returns `undefined`. This abstract component should be replaced
 *   (using a style sheet) with a non-abstract component, such as
 *   {@link postgres.TestPostgres} that will provide its own implementation
 *   of `connectEnv`.
 *
 * @public
 */
export function Postgres() {
    useImperativeMethods<ConnectToInstance>(() => ({
        connectEnv: (_scope: NetworkScope) => undefined
    }));
    return null;
}
