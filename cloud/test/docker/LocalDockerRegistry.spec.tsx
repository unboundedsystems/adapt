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

import Adapt from "@adpt/core";
import { mochaTmpdir } from "@adpt/testutils";
import execa from "execa";
import fs from "fs-extra";
import { uniq } from "lodash";
import path from "path";
import should from "should";
import { createActionPlugin } from "../../src/action/action_plugin";
import { MockDeploy, smallDockerImage } from "../testlib";
import { checkRegistryImage, deleteAllContainers } from "./common";

import {
    computeContainerName,
    LocalDockerRegistry,
} from "../../src/docker";
import {
    dockerInspect,
    dockerPull,
    dockerPush,
    dockerTag,
} from "../../src/docker/cli";

describe("LocalDockerRegistry", function () {
    let cleanupImageIds: string[] = [];
    let mockDeploy: MockDeploy;
    let pluginDir: string;

    this.timeout(60 * 1000);
    this.slow(4 * 1000);

    mochaTmpdir.all(`adapt-cloud-localdockerregistry`);

    before(async () => {
        pluginDir = path.join(process.cwd(), "plugins");
        await dockerPull({ imageName: smallDockerImage });
    });

    afterEach(async function () {
        this.timeout(20 * 1000);
        await deleteAllContainers(mockDeploy.deployID);
        try {
            await execa("docker", ["rmi", "-f", ...uniq(cleanupImageIds)]);
        } catch (e) { /* ignore errors */ }
        cleanupImageIds = [];
    });

    beforeEach(async () => {
        await fs.remove(pluginDir);
        mockDeploy = new MockDeploy({
            pluginCreates: [createActionPlugin],
            tmpDir: pluginDir,
            uniqueDeployID: true
        });
        await mockDeploy.init();
    });

    it("Should create a registry container", async () => {
        const orig = <LocalDockerRegistry portBindings={{ 5000: 5000 }} />;

        const { dom } = await mockDeploy.deploy(orig);
        if (dom == null) throw should(dom).not.be.Null();

        const contName = computeContainerName(dom.id, dom.buildData.deployID);
        should(contName).startWith("adapt-");

        const infos = await dockerInspect([contName]);
        should(infos).be.Array().of.length(1);
        const info = infos[0];
        if (info === undefined) should(info).not.Undefined();
        should(info.Name).equal(`/${contName}`);

        const registryTag = "localhost:5000/" + dom.buildData.deployID.toLowerCase();
        cleanupImageIds.push(registryTag);
        await dockerTag({
            existing: smallDockerImage,
            newTag: registryTag,
        });
        await dockerPush({ nameTag: registryTag });

        await checkRegistryImage(registryTag);

        //Delete
        await mockDeploy.deploy(null);
        const finalInfos = await dockerInspect([contName]);
        should(finalInfos).be.Array().of.length(0);
    });

});
