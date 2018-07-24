import * as path from "path";
import * as verdaccio from "../testlib/verdaccio";

import * as npm from "../../src/npm";

import { localRegistryPort, npmLocalProxyOpts } from "../common/config";
import { adaptDir, cloudDir, verdaccioDir } from "../common/paths";

const toPublish = [
    adaptDir,
    cloudDir,
];

async function setupLocalRegistry() {
    for (const modDir of toPublish) {
        await npm.publish(modDir, npmLocalProxyOpts);
    }
    // tslint:disable-next-line:no-console
    console.log(`>> Local NPM registry started [loaded ${toPublish.length} modules]\n`);
}

export const verdaccioConfigPath = path.join(verdaccioDir, "config.yaml");
export const verdaccioConfig: verdaccio.Config = {
    // Standard verdaccio config items
    storage: path.join(verdaccioDir, "storage"),
    auth: {
        htpasswd: {
            file: path.join(verdaccioDir, "htpasswd")
        }
    },
    uplinks: {
        npmjs: {
            url: "https://registry.npmjs.org/"
        }
    },
    packages: {
        "@usys/*": {
            access: "$all",
            publish: "$all",
            proxy: "npmjs",
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
    self_path: verdaccioConfigPath,

    // Our additional config items
    listen: `0.0.0.0:${localRegistryPort}`,
    onStart: setupLocalRegistry,
    clearStorage: true,
};
