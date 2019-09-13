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

import Adapt, { callInstanceMethod, handle, Sequence, SFCBuildProps, SFCDeclProps, useImperativeMethods } from "@adpt/core";
import { ConnectToInstance } from "../ConnectTo";
import { Container } from "../Container";
import { NetworkScope, NetworkService } from "../NetworkService";
import { Service } from "../Service";
import { PreloadedPostgresImage } from "./PreloadedPostgresImage";

/**
 * Props for the {@link postgres.TestPostgres} component
 *
 * @public
 */
export interface TestPostgresProps {
    mockDataPath: string;
    mockDbName: string;
}

/**
 * A component suitable for creating test scenarios that creates a simple,
 * temporary Postgres database that loads test data from a .sql file and
 * which implements the abstract {@link postgres.Postgres} interface.
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
 * @public
 */
export function TestPostgres(props: SFCDeclProps<TestPostgresProps>) {
    const bProps = props as SFCBuildProps<TestPostgresProps>;
    const dbCtr = handle();
    const svc = handle();

    useImperativeMethods<ConnectToInstance>(() => ({
        connectEnv: (scope: NetworkScope) => {
            const svcHostname = callInstanceMethod(svc, undefined, "hostname", scope);
            if (!svcHostname) return undefined;
            return [
                { name: "PGHOST", value: svcHostname },
                { name: "PGDATABASE", value: bProps.mockDbName },
                { name: "PGUSER", value: "postgres" },
                { name: "PGPASSWORD", value: "hello" }
            ];
        }
    }));

    const img = handle();

    return <Sequence key={bProps.key} >
        <PreloadedPostgresImage
            key={bProps.key + "-img"}
            handle={img}
            mockDbName={bProps.mockDbName}
            mockDataPath={bProps.mockDataPath}
        />
        <Service key={bProps.key} >
            <NetworkService
                key={bProps.key + "-netsvc"}
                handle={svc}
                scope="cluster-internal"
                endpoint={dbCtr}
                port={5432}
            />
            <Container
                key={bProps.key}
                name="db"
                handle={dbCtr}
                image={img}
                environment={{ POSTGRES_PASSWORD: "hello" }}
                imagePullPolicy="Never"
                ports={[5432]}
            />
        </Service>
    </Sequence>;
}
