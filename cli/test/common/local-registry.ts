import * as path from "path";
import * as verdaccio from "../testlib/mocha-verdaccio";

import * as npm from "../../src/npm";

import { localRegistryPort, npmLocalProxyOpts } from "../common/config";
import { adaptDir, cloudDir, verdaccioDir } from "../common/paths";

const toPublish = [
    adaptDir,
    cloudDir,
];

async function setupLocalRegistry(done: MochaDone) {
    for (const modDir of toPublish) {
        await npm.publish(modDir, npmLocalProxyOpts);
    }
    // tslint:disable-next-line:no-console
    console.log(`>> Local NPM registry started [loaded ${toPublish.length} modules]\n`);
    done();
}

const verdaccioConfigPath = path.join(verdaccioDir, "config.yaml");
const verdaccioConfig: verdaccio.Config = {
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
    onStart: setupLocalRegistry,
    self_path: verdaccioConfigPath,
    clearStorage: true,
};

// Use the mocha-verdaccio test fixture. Starts verdaccio before any test
// starts
verdaccio.all(verdaccioConfig, `0.0.0.0:${localRegistryPort}`, verdaccioConfigPath);
