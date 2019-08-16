/*
 * Copyright 2018 Unbounded Systems, LLC
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
    deployID = deployID.replace(/[:/]/g, "_");
    return path.join(localServerDir, "deployments", deployID);
}

export async function findHistoryDirs(deploymentDir: string): Promise<string[]> {
    const historyDirs = await fs.readdir(deploymentDir);
    return historyDirs.map((d) => path.join(deploymentDir, d));
}
