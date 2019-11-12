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

import { dockerutils } from "@adpt/testutils";
import should from "should";
import { adaptDockerDeployIDKey, NameTagString } from "../../src/docker";
import { dockerInspect, dockerPull, dockerRemoveImage } from "../../src/docker/cli";

const { deleteAllContainers, deleteAllImages, deleteAllNetworks } = dockerutils;
export {
    deleteAllContainers,
    deleteAllImages,
    deleteAllNetworks,
};

export const deployIDFilter = (deployID: string) =>
    `label=${adaptDockerDeployIDKey}=${deployID}`;

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
