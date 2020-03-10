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

import { onExit } from "@adpt/utils";
import { Hook } from "@oclif/config";
import db from "debug";
import path from "path";
import { config } from "../config";
import { UpgradeChecker } from "./upgrade_checker";

const debug = db("adapt:upgrade");

const hook: Hook<"init"> = async () => {
    const conf = await config();
    const enabled = conf.user.upgradeCheck;
    debug(`Upgrade check is ${enabled}`);
    if (!enabled) return;

    try {
        const checker = new UpgradeChecker({
            channel: conf.user.upgradeChannel,
            configDir: conf.package.configDir,
            logDir: path.join(conf.package.cacheDir, "logs"),
            upgradeCheckInterval: conf.user.upgradeCheckInterval,
            upgradeCheckUrl: conf.user.upgradeCheckUrl,
            upgradeRemindInterval: conf.user.upgradeRemindInterval,
            upgradeIgnore: conf.user.upgradeIgnore,
        }, conf.state);

        await checker.check();

        onExit(async (signal, code) => {
            if (signal === "exit" && code === 0) {
                const msg = await checker.notifyString({ fancy: true });
                // tslint:disable-next-line: no-console
                if (msg) console.log(msg);
            }
        });

    } catch (err) {
        debug(`Error starting upgrade check:`, err);
    }
};
export default hook;
