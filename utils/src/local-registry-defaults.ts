import * as path from "path";
import { Config } from "./local-registry";
import { repoDirs } from "./paths";

import * as npm from "./npm";

export const localRegistryPort = 4873;
export const localRegistryUrl = `http://127.0.0.1:${localRegistryPort}`;

export const npmLocalProxyOpts = {
    registry: localRegistryUrl,
    userconfig: path.join(repoDirs.verdaccio, "npmrc_test"),
};

export const defaultPublishList = [
    repoDirs.adapt,
    repoDirs.cloud,
    repoDirs["dom-parser"],
    repoDirs.utils,
];

export async function setupLocalRegistry(publishList: string[]): Promise<void> {
    let output = "";
    try {
        for (const modDir of publishList) {
            const out = await npm.publish(modDir, npmLocalProxyOpts);
            output += out.stderr + out.stdout;
        }
    } catch (err) {
        output = `Local registry setup failed: ${err.message}`;
        if (err.stderr) output += err.stderr;
        if (err.stdout) output += err.stdout;
        // tslint:disable-next-line:no-console
        console.error(output);
        throw new Error(`Local registry setup failed`);
    }
    // tslint:disable-next-line:no-console
    console.log(`${output}\n>> Local NPM registry started [loaded ${publishList.length} modules]\n`);
}

function setupDefault(): Promise<void> {
    return setupLocalRegistry(defaultPublishList);
}

export const configPath = path.join(repoDirs.verdaccio, "config.yaml");
export const config: Config = {
    // Standard verdaccio config items
    storage: path.join(repoDirs.verdaccio, "storage"),
    auth: {
        htpasswd: {
            file: path.join(repoDirs.verdaccio, "htpasswd")
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
    self_path: configPath,

    // Our additional config items
    listen: `0.0.0.0:${localRegistryPort}`,
    onStart: setupDefault,
    clearStorage: true,
};
