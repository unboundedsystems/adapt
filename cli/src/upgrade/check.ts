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

import { formatUserError } from "@adpt/utils";
import db from "debug";
import { createState } from "../config/load";
import { UpgradeChecker } from "./upgrade_checker";

// Always log to stderr, which is normally directed to a log file.
const oldDebugs = db.disable();
db.enable(oldDebugs + oldDebugs ? "," : "" + "adapt:upgrade");

const debug = db("adapt:upgrade");

async function main() {
    debug("Starting upgrade check");
    debug("Arguments:", process.argv.join(" "));
    const config = JSON.parse(process.argv[2]);
    const state = createState(config.configDir, false);
    const checker = new UpgradeChecker(config, state);
    const upgrade = await checker.fetch();
    state.set({
        lastUpgradeCheck: Date.now(),
        upgrade
    });
}

main().catch((err) => {
    debug("FAILED: Error running upgrade check:", formatUserError(err));
    process.exit(1);
});
