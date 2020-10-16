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

/**
 * This fixture runs one shared instance of a BuildKit daemon that defers start
 * until the first test that needs it and then stops after all tests are
 * done.
 * The daemon is accessible via the `buildKitHost()` address, which uses
 * the `docker-container://` protocol.
 */
const bkFixture = dockerMocha.all({
    Image: "moby/buildkit:v0.7.2-rootless",
    Cmd: [ "--oci-worker-no-process-sandbox" ],
    HostConfig: {
        Devices: [{
            PathOnHost: "/dev/fuse",
            PathInContainer: "/dev/fuse",
            CgroupPermissions: "rwm",
        }],
        NetworkMode: "host",
        SecurityOpt: [
            "apparmor=unconfined",
            "seccomp=unconfined",
        ],
    },
}, {
    delayStart: true,
    finalSetup,
    namePrefix: "test-buildkit2",
});
export default bkFixture;

let bkHost: string | undefined;

/**
 * The BuildKit host (or --addr) string for the shared BuildKit daemon.
 * This always uses the `docker-container://NAME` form.
 * Note that the daemon will not start until a test needs
 * it, so this function may take some time to return for the first user.
 * Increase timeouts in the caller's test/before function accordingly.
 */
export async function buildKitHost(): Promise<string> {
    await bkFixture.start();
    if (!bkHost) throw new Error(`BuildKit started but bkHost not set`);
    return bkHost;
}

async function finalSetup(fixture: dockerMocha.DockerFixture) {
    const info = await fixture.container.inspect();
    // Name always starts with one slash
    bkHost = `docker-container:/${info.Name}`;
}
