/*
 * Copyright 2019 Unbounded Systems, LLC
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
import { uniq } from "lodash";
import should from "should";
import { adaptDockerDeployIDKey, NameTagString } from "../../src/docker";
import { dockerInspect, dockerPull, dockerRemoveImage } from "../../src/docker/cli";

export async function deleteAllContainers(deployID: string) {
    try {
        const { stdout: ctrList } = await execa("docker", ["ps", "-a", "-q",
            "--filter", `label=${adaptDockerDeployIDKey}=${deployID}`]);
        if (!ctrList) return;
        const ctrs = ctrList.split(/\s+/);
        if (ctrs.length > 0) await execa("docker", ["rm", "-f", ...ctrs]);
    } catch (err) {
        // tslint:disable-next-line: no-console
        console.log(`Error deleting containers (ignored):`, err);
    }
}

export async function deleteAllImages(deployID: string) {
    try {
        const { stdout: imgList } = await execa("docker", ["image", "ls", "-q",
            "--filter", `label=${adaptDockerDeployIDKey}=${deployID}`]);
        if (!imgList) return;
        const imgs = uniq(imgList.split(/\s+/m));
        if (imgs.length > 0) await execa("docker", ["rmi", "-f", ...imgs]);
    } catch (err) {
        // tslint:disable-next-line: no-console
        console.log(`Error deleting images (ignored):`, err);
    }
}

export async function checkRegistryImage(registryTag: NameTagString) {
    // Remove the tag locally and ensure it's gone
    await dockerRemoveImage({ nameOrId: registryTag });
    let regTagInfo = await dockerInspect([registryTag]);
    should(regTagInfo).be.Array().of.length(0);

    // Now pull the tag and verify it's back
    await dockerPull({ imageName: registryTag });
    regTagInfo = await dockerInspect([registryTag]);
    should(regTagInfo).be.Array().of.length(1);
}
