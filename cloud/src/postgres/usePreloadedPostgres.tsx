import * as fs from "fs-extra";
import { useDockerBuild } from "..";

export function usePreloadedPostgres(mockDbName: string, mockDataPath: string) {
    return useDockerBuild(async () => {
        const rawMockData = await fs.readFile(mockDataPath);
        const prefix = `CREATE DATABASE ${mockDbName};\n\\c ${mockDbName}\n`;
        const mockData = Buffer.concat([Buffer.from(prefix), rawMockData]);
        return {
            dockerfile: `
                FROM postgres:11
                COPY --from=files mockdata.sql /docker-entrypoint-initdb.d/mockdata.sql
            `,
            dockerHost: process.env.DOCKER_HOST,
            options: { imageName: "preloaded-postgres" },
            files: [{
                    path: "mockdata.sql",
                    contents: mockData
            }]
        };
    });
}
