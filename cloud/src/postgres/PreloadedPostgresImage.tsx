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

import Adapt, {
    handle,
    useMethodFrom,
    useState,
} from "@adpt/core";
import * as fs from "fs-extra";
import { LocalDockerImage, LocalDockerImageProps } from "../docker";

/**
 * Props for {@link postgres.PreloadedPostgresImage}
 *
 * @public
 */
export interface PreloadedPostgresImageProps {
    /** Name of database in which to load mock data */
    mockDbName: string;
    /**
     * Path to a sql file with both schema and data to load into the database
     *
     * @remarks
     *
     * This data can be produced by standing up a postgres instance, populating it with
     * the required data and then running {@link https://www.postgresql.org/docs/9.1/app-pgdump.html | pg_dump}.
     */
    mockDataPath: string;
}

/**
 * Creates a throw-away {@link https://www.postgresql.org | Postgres} database with preloaded data.
 *
 * @remarks
 * Implements {@link docker.DockerImageInstance}.
 *
 * See {@link postgres.PreloadedPostgresImageProps}
 *
 * @public
 */
export function PreloadedPostgresImage(props: PreloadedPostgresImageProps) {
    const [imgProps, setImgProps] = useState<LocalDockerImageProps | undefined>(undefined);
    setImgProps(async () => {
        const rawMockData = await fs.readFile(props.mockDataPath);
        const prefix = `CREATE DATABASE ${props.mockDbName};\n\\c ${props.mockDbName}\n`;
        const mockData = Buffer.concat([Buffer.from(prefix), rawMockData]);
        return {
            dockerfile: `
                FROM postgres:11
                COPY --from=files mockdata.sql /docker-entrypoint-initdb.d/mockdata.sql
            `,
            dockerHost: process.env.DOCKER_HOST,
            options: {
                imageName: "preloaded-postgres",
                uniqueTag: true
            },
            files: [{
                path: "mockdata.sql",
                contents: mockData
            }]
        };
    });

    const img = handle();
    useMethodFrom(img, "image");
    useMethodFrom(img, "latestImage");

    return imgProps ? <LocalDockerImage handle={img} {...imgProps} /> : null;
}
