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
import { MockDeploy } from "../testlib";
import { deleteAllContainers } from "./common";

import {
    computeContainerName,
    DockerContainer
} from "../../src/docker";
import {
    dockerImageId,
    dockerInspect
} from "../../src/docker/cli";

describe("DockerContainer", function () {
    let cleanupImageIds: string[] = [];
    let mockDeploy: MockDeploy;
    let pluginDir: string;

    this.timeout(60 * 1000);
    this.slow(4 * 1000);

    mochaTmpdir.all(`adapt-cloud-localdockerimage`);

    before(() => {
        pluginDir = path.join(process.cwd(), "plugins");
    });

    afterEach(async function () {
        this.timeout(20 * 1000);
        await deleteAllContainers(mockDeploy.deployID);
        await Promise.all(
            uniq(cleanupImageIds).map((id) => execa("docker", ["rmi", "-f", id]))
        );
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

    it("Should create and destroy a container with a string image", async () => {
        const imageName = "alpine:3.8";
        const orig = <DockerContainer image="alpine:3.8" />;

        //Create
        const { dom } = await mockDeploy.deploy(orig);
        if (dom == null) throw should(dom).not.be.Null();

        const contName = computeContainerName(dom.id, dom.buildData.deployID);
        should(contName).startWith("adapt-");

        const infos = await dockerInspect([contName]);
        should(infos).be.Array().of.length(1);
        const info = infos[0];
        if (info === undefined) should(info).not.Undefined();

        should(info.Name).equal(`/${contName}`);
        const id = await dockerImageId(imageName);
        should(info.Image).equal(id);

        //Delete
        await mockDeploy.deploy(null);
        const finalInfos = await dockerInspect([contName]);
        should(finalInfos).be.Array().of.length(0);
    });

});
