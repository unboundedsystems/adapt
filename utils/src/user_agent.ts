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

import execa from "execa";
import os from "os";

export interface UserAgentOptions {
    name: string;
    version: string;
    docker?: boolean;
}

export async function userAgent(options: UserAgentOptions) {
    const items = [
        format(options.name, options.version),
        format(os.type(), `${os.release()}-${os.arch()}`),
        format("Node", process.version),
    ];

    const dev = await devInfo();
    if (dev) items.push(format("Dev", dev));

    const docker = options.docker && await dockerInfo();
    if (docker) items.push(format("Docker", docker));

    return items.join(" ");
}

function format(name: string, info?: string) {
    name = name.replace(/\//g, "-");
    if (!info) return name;
    info = info.replace(/ /g, "_");
    return `${name}/${info}`;
}

async function dockerInfo() {
    try {
        const result = await execa("docker", [ "version", "-f", "{{json .}}" ],
            { reject: false });
        const versions = JSON.parse(result.stdout);
        const client = versions.Client.Version;
        const server = versions.Server && versions.Server.Version;
        if (!server) return client;
        return `${client}+${server}`;
    } catch (_) {
        return "";
    }
}

async function devInfo() {
    try {
        await execa("git", [ "rev-parse", "--git-dir" ], { cwd: __dirname });
        return "true";
    } catch (_) {
        return "";
    }
}
