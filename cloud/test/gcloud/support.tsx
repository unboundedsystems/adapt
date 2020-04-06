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
    f: (globalOpts: { configuration: string } & GCloudGlobalOpts) => void) {

    describeLong(name, () => {
        const svcAcctName = process.env.ADAPT_UNIT_TEST_GCLOUD_SVCACCT;
        const svcAcctKey = process.env.ADAPT_UNIT_TEST_GCLOUD_SVCACCT_KEY;
        const useConfig = process.env.ADAPT_UNIT_TEST_GCLOUD_USE_CONFIG;
        const confName = "adapt-cloud-gcloud-testing";

        before(async function () {
            if (useConfig) {
                return;
            }

            if (!svcAcctKey || !svcAcctName) {
                this.skip();
                return;
            }

            await setupGCloudConfig({
                confName,
                svcAcctName,
                svcAcctKey
            });
        });

        after(async () => {
            if (!useConfig) await destroyGCloudConfig(confName);
        });

        if (useConfig) return f({ configuration: useConfig });
        else return f({ configuration: confName });
    });
}

async function setupGCloudConfig(options: {
    confName: string,
    svcAcctName: string,
    svcAcctKey: string
}) {
    const { confName, svcAcctName, svcAcctKey } = options;
    await destroyGCloudConfig(confName);
    await execGCloud([
        "config",
        "configurations",
        "create",
        "--no-activate",
        confName
    ], {});

    const opts = { configuration: confName };

    const project = "adapt-ci";
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
        "region",
        region
    ], opts);

    await withTmpDir(async (loc) => {
        const keyFile = path.join(loc, "acctKey");
        await writeFile(keyFile, svcAcctKey);

        await execGCloud([
            "auth",
            "activate-service-account",
            svcAcctName,
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
