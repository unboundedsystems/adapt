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
    const { name, version } = options;
    let ua = `${name}/${version} (${os.type()}/${os.release()}; ${os.arch()}) Node/${process.version}`;
    if (options.docker) {
        const docker = await dockerVersion();
        if (docker) ua += ` ${docker}`;
    }
    return ua;
}

async function dockerVersion() {
    try {
        const result = await execa("docker", [ "version", "-f", "{{json .}}" ],
            { reject: false });
        const versions = JSON.parse(result.stdout);
        const client = versions.Client.Version;
        const server = versions.Server && versions.Server.Version;
        let ret = `Docker/${client}`;
        if (server) ret += `+${server}`;
        return ret;
    } catch (e) {
        return "";
    }
}
