/*
 * Copyright 2018-2019 Unbounded Systems, LLC
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

import { waitFor } from "@adpt/utils";
import * as fs from "fs-extra";
import path from "path";

export async function installOnce(
    installId: string,
    timeoutSec: number,
    action: () => Promise<void>): Promise<void> {

    const baseDir = path.join("/", "var", "run", "adapt_test_install");
    const dir = path.join(baseDir, installId);
    const statusFile = path.join(dir, "status");

    await fs.ensureDir(baseDir);
    try {
        // Directory creation is atomic, even on most (all?) network filesystems
        await fs.mkdir(dir);
    } catch (err) {
        if (err.code !== "EEXIST") throw err;

        // Someone else is installing or has installed already
        await waitFor(timeoutSec, 1, `Timed out waiting for ${installId} install`,
            async () => fs.pathExists(statusFile));
        const status = (await fs.readFile(statusFile)).toString();
        if (status === "success") return;
        throw new Error(`Install of ${installId} failed: ${status}`);
    }

    try {
        await action();
        await fs.writeFile(statusFile, "success");
    } catch (err) {
        await fs.writeFile(statusFile, String(err));
    }
}
