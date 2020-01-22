/*
 * Copyright 2018-2020 Unbounded Systems, LLC
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

import { Omit, repoRootDir, yarn } from "@adpt/utils";
import * as fs from "fs-extra";
import * as path from "path";
import { Config } from "./local-registry";

export const localRegistryPort = 4873;
export const localRegistryUrl = `http://127.0.0.1:${localRegistryPort}`;

export interface YarnProxyOpts {
    registry?: string;
    tag?: string;
}

export const yarnLocalProxyOpts = {
    registry: localRegistryUrl,
    tag: "unit-tests",
};

const topLevelPackageJson = fs.readJsonSync(path.join(repoRootDir, "package.json"));
const configDir = path.join(repoRootDir, "config");

export const defaultPublishList =
    topLevelPackageJson.workspaces.packages
        .filter((p: string) => {
            switch (path.basename(p)) {
                case "scripts":
                case "systemtest":
                case "testutils":
                    return false;
                default:
                    return true;
            }
        })
        .map((p: string) => path.join(repoRootDir, p));

export async function setupLocalRegistry(publishList: string[], options: YarnProxyOpts = {}): Promise<void> {
    const { tag, ...opts } = { ...yarnLocalProxyOpts, ...options };
    try {
        for (const modDir of publishList) {
            const pkgJson = await fs.readJson(path.join(modDir, "package.json"));
            const modName = pkgJson.name;
            await yarn.publish(modDir, { tag, ...opts });
            // Always clean yarn's cache when publishing a package which
            // might be the same name/version, but with different bits.
            await yarn.cacheClean(modName, opts);
        }
    } catch (err) {
        let output = `Local registry setup failed: ${err.message}`;
        if (err.stderr) output += err.stderr;
        if (err.stdout) output += err.stdout;
        // tslint:disable-next-line:no-console
        console.error(output);
        throw new Error(output);
    }
    // tslint:disable-next-line:no-console
    console.log(`\n>> Local NPM registry started on ${opts.registry} ` +
        `[loaded ${publishList.length} modules]\n`);
}

function setupDefault(): Promise<void> {
    return setupLocalRegistry(defaultPublishList);
}

// This file doesn't need to exist
export const configPath = path.join(configDir, "config.yaml");

// This is a valid config except it does not have the required storage
// property, so that must be provided whenever these defaults are used.
export const config: Omit<Config, "storage"> = {
    // Standard verdaccio config items
    auth: {
        htpasswd: {
            file: path.join(configDir, "verdaccio.htpasswd")
        }
    },
    uplinks: {
        npmjs: {
            url: "https://registry.npmjs.org/",
            // After 100 errors from the upstream, report an error and
            // mark the upstream as DOWN.
            max_fails: 100,
            // Timeout on each individual request to the upstream
            timeout: "3s",
            // Once the upstream is marked DOWN, it will stay that way
            // for this long before we try to use it again.
            fail_timeout: "0s",

            agent_options: {
                keepAlive: true,
                keepAliveMsecs: 5000,
                timeout: 500,
            },
        }
    },
    packages: {
        // We don't proxy @adpt packages so we can locally
        // publish the same versions as are on npmjs.
        "@adpt/*": {
            access: "$all",
            publish: "$all",
        },
        "**": {
            access: "$all",
            publish: "$all",
            proxy: "npmjs"
        },
    },
    logs: [
        { type: "stdout", format: "pretty", level: "error" }
    ],
    self_path: configPath,

    // Our additional config items
    listen: `0.0.0.0:${localRegistryPort}`,
    onStart: setupDefault,
    clearStorage: false,
};
