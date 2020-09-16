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

// tslint:disable: no-submodule-imports
import { clitest } from "@adpt/cli/dist/test/common/fancy";
import { cliLocalRegistry } from "@adpt/cli/dist/test/common/start-local-registry";
import { mochaTmpdir } from "@adpt/testutils";
import { findPackageDirs } from "@adpt/utils";
import fs from "fs-extra";
import path from "path";
import { pathToFileURL } from "url";

export const packageDirs = findPackageDirs(__dirname);
export const pkgRootDir = packageDirs.root;

export const systemTestChain =
    clitest
    .add("origDir", () => process.cwd())
    .finally((ctx) => process.chdir(ctx.origDir))
    .onerror((ctx) => {
        // tslint:disable:no-console
        console.log(`\n---------------------------------\nError encountered. Dumping stdout.`);
        console.log(ctx.stdout);
        console.log(`\n---------------------------------\nError encountered. Dumping stderr.`);
        console.log(ctx.stderr);
        // tslint:enable:no-console
    })
    .stub(process.stdout, "isTTY", false) // Turn off progress, etc
    .stdout()
    .stderr()
    .delayedenv(() => {
        return {
            ADAPT_NPM_REGISTRY: cliLocalRegistry.yarnProxyOpts.registry,
            ADAPT_SERVER_URL: pathToFileURL("../local_server").href,
        };
    });

export const projectsRoot = path.join(pkgRootDir, "test_projects");
export const appSubdir = "app";

async function appSetupCommon(appName: string) {
    const appDir = path.join(projectsRoot, appName);
    await fs.copy(appDir, appSubdir);
    process.chdir(appSubdir);
}

export const systemAppSetup = {
    all(appName: string) {
        mochaTmpdir.all("adapt-sys-test-" + appName);
        before("systemAppSetup", async () => {
            await appSetupCommon(appName);
        });
    },
    each(appName: string) {
        mochaTmpdir.each("adapt-sys-test-" + appName);
        beforeEach("systemAppSetup", async () => {
            await appSetupCommon(appName);
        });
    }
};

export const curlOptions = [
    "--silent", "--show-error", // No progress, just errors
    "--max-time", "1",
];
