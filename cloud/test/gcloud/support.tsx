/*
 * Copyright 2020 Unbounded Systems, LLC
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

import { describeLong } from "@adpt/testutils";
import { withTmpDir } from "@adpt/utils";
import { writeFile } from "fs-extra";
import * as path from "path";
import { isExecaError } from "../../src/common";
import { execGCloud, GCloudGlobalOpts } from "../../src/gcloud/commands";

export function describeGCloud(
    name: string,
    f: (this: Mocha.Suite, globalOpts: { configuration: string } & GCloudGlobalOpts) => void) {

    describeLong(name, function () {
        const project = process.env.ADAPT_UNIT_TEST_GCLOUD_PROJECT || "adapt-ci";
        const svcAcctJson = process.env.ADAPT_UNIT_TEST_GCLOUD_SVCACCT_JSON;
        const useConfig = process.env.ADAPT_UNIT_TEST_GCLOUD_USE_CONFIG;
        const confName = "adapt-cloud-gcloud-testing";

        before(async function () {
            this.timeout("30s");

            if (useConfig) {
                return;
            }

            if (!svcAcctJson) {
                this.skip();
                return;
            }

            const svcAcct = JSON.parse(svcAcctJson);

            await setupGCloudConfig({
                project,
                confName,
                svcAcct
            });
        });

        after(async function () {
            this.timeout("2m");
            if (!useConfig) await destroyGCloudConfig(confName);
        });

        if (useConfig) return f.call(this, { configuration: useConfig });
        else return f.call(this, { configuration: confName });
    });
}

async function setupGCloudConfig(options: {
    project: string,
    confName: string,
    svcAcct: string
}) {
    const { confName, svcAcct, project } = options;
    await destroyGCloudConfig(confName);
    await execGCloud([
        "config",
        "configurations",
        "create",
        "--no-activate",
        confName
    ], {});

    const opts = { configuration: confName };

    const region = "us-west1";

    await execGCloud([
        "config",
        "set",
        "project",
        project
    ], opts);

    await execGCloud([
        "config",
        "set",
        "compute/region",
        region
    ], opts);

    await withTmpDir(async (loc) => {
        const keyFile = path.join(loc, "acctKey");
        await writeFile(keyFile, JSON.stringify(svcAcct));

        await execGCloud([
            "auth",
            "activate-service-account",
            "--key-file",
            keyFile
        ], opts);
    });
}

async function destroyGCloudConfig(confName: string) {
    try {
        await execGCloud([
            "config",
            "configurations",
            "delete",
            confName
        ], {});
    } catch (e) {
        if (!isExecaError(e)) {
            throw e;
        }
        if (!/it does not exist\./.test(e.stderr)) {
            throw e;
        }
    }
}
