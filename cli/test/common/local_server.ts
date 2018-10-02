import * as fs from "fs-extra";
import * as path from "path";

export async function findDeploymentDirs(localServerDir?: string): Promise<string[]> {
    if (!localServerDir) localServerDir = path.resolve("local_server");
    const depDir = path.join(localServerDir, "deployments");
    const deploymentList = await fs.readdir(depDir);
    return deploymentList.map((d) => path.join(depDir, d));
}

export function findDeploymentDir(deployID: string, localServerDir?: string): string {
    if (!localServerDir) localServerDir = path.resolve("local_server");
    return path.join(localServerDir, "deployments", deployID);
}

export async function findHistoryDirs(deploymentDir: string): Promise<string[]> {
    const historyDirs = await fs.readdir(deploymentDir);
    return historyDirs.map((d) => path.join(deploymentDir, d));
}
