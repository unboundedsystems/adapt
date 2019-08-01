import Adapt, { handle, useImperativeMethods, useState } from "@adpt/core";
import * as fs from "fs-extra";
import { LocalDockerImage, LocalDockerImageProps } from "../docker";
import { callInstanceMethod, useInstanceValue } from "../hooks";

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
 * See {@link postgres.PreloadedPostgresProps}
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
    const image = useInstanceValue(img, undefined, "image");
    useImperativeMethods(() => ({
        latestImage: () => callInstanceMethod(img, undefined, "latestImage"),
        image
    }));

    return imgProps ? <LocalDockerImage handle={img} {...imgProps} /> : null;
}
