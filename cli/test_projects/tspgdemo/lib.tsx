import { useDockerBuild } from "@usys/cloud";
import * as fs from "fs-extra";

export function Postgres() { return null; }

export function usePreloadedPostgres(mockDbName: string, mockDataPath: string) {
    return useDockerBuild(async () => {
        const rawMockData = await fs.readFile(mockDataPath);
        const prefix = `CREATE DATABASE ${mockDbName};\n\\c ${mockDbName}\n`;
        const mockData = Buffer.concat([Buffer.from(prefix), rawMockData]);
        return {
            dockerfile: "Dockerfile",
            dockerHost: process.env.DOCKER_HOST,
            options: { imageName: "preloaded-postgres" },
            files: [
                {
                    path: "Dockerfile",
                    contents: `
FROM postgres:11
COPY mockdata.sql /docker-entrypoint-initdb.d/mockdata.sql
`
                },
                {
                    path: "mockdata.sql",
                    contents: mockData
                }
            ]
        };
    });
}
