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

import { dockerMocha } from "@adpt/testutils";
import { waitForNoThrow } from "@adpt/utils";
import fetch from "node-fetch";

/**
 * This fixture runs one shared instance of a Docker registry that defers start
 * until the first test that needs it and then stops after all tests are
 * done.
 * The registry is accessible at the `registryHost()` address, which is
 * always a localhost address, both in containers and outside due to using
 * both `PublishAllPorts` for the host and a localhost proxy for the current
 * container.
 */
const regFixture = dockerMocha.all({
    Image: "registry:2",
    HostConfig: {
        PublishAllPorts: true,
    },
    // Env: [
    //     "REGISTRY_STORAGE_DELETE_ENABLED=true",
    // ],
}, {
    delayStart: true,
    finalSetup,
    proxyPorts: true,
    namePrefix: "docker-registry",
});
export default regFixture;

let regHost: string | undefined;

/**
 * The localhost registry host string in the form `localhost:1234` for the
 * shared registry. Note that the registry will not start until a test needs
 * it, so this function may take some time to return for the first user.
 * Increase timeouts in the caller's test/before function accordingly.
 */
export async function registryHost(): Promise<string> {
    await regFixture.start();
    if (!regHost) throw new Error(`Registry started by regHost not set`);
    return regHost;
}

async function finalSetup(fixture: dockerMocha.DockerFixture) {
    const localPorts = await fixture.ports(true);
    const host = localPorts["5000/tcp"];
    if (!host) throw new Error(`Unable to get host/port for registry`);
    regHost = host;

    await waitForNoThrow(60, 1, async () => {
        const resp = await fetch(`http://${host}/v2/`);
        if (!resp.ok) throw new Error(`Registry ping returned status ${resp.status}: ${resp.statusText}`);
    });
}
