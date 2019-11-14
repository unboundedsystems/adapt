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
import ld from "lodash";
import { ConnectToInstance } from "../ConnectTo";

/**
 * Props for the {@link postgres.PostgresProvider} component
 *
 * @public
 */
export interface PostgresProviderProps {
    /** Hostname for the Postgres database as it would appear in the PGHOST environment variable */
    host?: string;
    /** Postgres database name as it would appear in the PGDATABASE environment variable */
    database?: string;
    /** Postgres username as it would appear in the PGUSER environment variable */
    user?: string;
    /** Postgres password as it would appear in the PGPASSWORD environment variable */
    password?: string;
}

function notUndefined<T>(x: T | undefined): x is T {
    return x !== undefined;
}

/**
 * Component that represents an external provider of a Postgres database
 *
 * @remarks
 *
 * See {@link postgres.PostgresProviderProps}.
 *
 * Use this component to connect other cloud components to a external
 * Postgres services, such as Google CloudSQL or Amazon RDS.
 *
 * @example
 *
 * ```
 * const pg = handle();
 *
 * <PostgresProvider handle={pg}
 *   hostname="mypostgres.com:5432"
 *   db="db"
 *   user="myuser"
 *   password={process.env.PGPASSWORD}
 * />
 *
 * <NodeService src="/somedir" connectTo={pg} />
 * ```
 *
 * @public
 */
export function PostgresProvider(props: PostgresProviderProps) {
    useImperativeMethods<ConnectToInstance>(() => ({
        connectEnv: () => ld.pickBy({
            PGHOST: props.host,
            PGDATABASE: props.database,
            PGUSER: props.user,
            PGPASSWORD: props.password
        }, notUndefined)
    }));
    return null;
}

export default PostgresProvider;
