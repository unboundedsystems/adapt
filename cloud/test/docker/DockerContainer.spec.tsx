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
import { deleteAllContainers, deleteAllNetworks } from "./common";

import {
    adaptDockerDeployIDKey,
    computeContainerName,
    DockerContainer
} from "../../src/docker";
import {
    dockerImageId,
    dockerInspect,
    execDocker
} from "../../src/docker/cli";

describe("DockerContainer", function () {
    let cleanupImageIds: string[] = [];
    let mockDeploy: MockDeploy;
    let pluginDir: string;
    let testNet1: string;
    let testNet2: string;

    this.timeout(60 * 1000);
    this.slow(4 * 1000);

    mochaTmpdir.all(`adapt-cloud-localdockerimage`);

    before(() => {
        pluginDir = path.join(process.cwd(), "plugins");
    });

    afterEach(async function () {
        this.timeout(20 * 1000);
        await deleteAllContainers(mockDeploy.deployID);
        await deleteAllNetworks(mockDeploy.deployID);
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

        async function createDockerNetwork(prefix: string) {
            const netName = prefix + "-" + mockDeploy.deployID;
            await execDocker(["network", "create", netName, "--label", `${adaptDockerDeployIDKey}=${mockDeploy.deployID}`], {});
            return netName;
        }
        testNet1 = await createDockerNetwork("testNet1");
        testNet2 = await createDockerNetwork("testNet2");
    });

    it("Should create and destroy a container with a string image", async () => {
        const imageName = "alpine:3.8";
        const orig = <DockerContainer image="alpine:3.8" />;

        //Create
        const { dom } = await mockDeploy.deploy(orig);
        if (dom == null) throw should(dom).not.be.Null();

        const contName = computeContainerName(dom.id, dom.buildData.deployID);
        should(contName).startWith("adapt-");

        const infos = await dockerInspect([contName], { type: "container" });
        should(infos).be.Array().of.length(1);
        const info = infos[0];
        if (info === undefined) throw should(info).not.Undefined();

        should(info.Name).equal(`/${contName}`);
        const id = await dockerImageId(imageName);
        should(info.Image).equal(id);

        //Delete
        await mockDeploy.deploy(null);
        const finalInfos = await dockerInspect([contName]);
        should(finalInfos).be.Array().of.length(0);
    });

    it("Should attach container to networks", async () => {
        const orig = <DockerContainer image="alpine:3.8" networks={[testNet1, testNet2]} />;

        const { dom } = await mockDeploy.deploy(orig);
        if (dom == null) throw should(dom).not.be.Null();
        const contName = computeContainerName(dom.id, dom.buildData.deployID);

        const infos = await dockerInspect([contName], { type: "container" });
        should(infos).be.Array().of.length(1);
        const info = infos[0];
        if (info === undefined) throw should(info).not.Undefined();
        should(info.NetworkSettings.Networks).have.keys(testNet1, testNet2);
    });

    it("Should update networks on existing container", async () => {
        const orig = <DockerContainer image="alpine:3.8" networks={[testNet1, testNet2]} />;

        const { dom } = await mockDeploy.deploy(orig);
        if (dom == null) throw should(dom).not.be.Null();
        const contName = computeContainerName(dom.id, dom.buildData.deployID);

        const infos = await dockerInspect([contName], { type: "container" });
        should(infos).be.Array().of.length(1);
        const info = infos[0];
        if (info === undefined) throw should(info).not.Undefined();
        should(info.NetworkSettings.Networks).have.keys(testNet1, testNet2);

        //Remove testNet2 to see if removal update works
        const removeNet2 = <DockerContainer image="alpine:3.8" networks={[testNet1]} />;
        await mockDeploy.deploy(removeNet2);
        //Purposely look at old container name
        const infos2 = await dockerInspect([contName], { type: "container" });
        should(infos2).be.Array().of.length(1);
        const info2 = infos2[0];
        if (info2 === undefined) throw should(info2).not.Undefined();
        should(info2.NetworkSettings.Networks).have.keys(testNet1);
        should(info2.NetworkSettings.Networks).not.have.keys(testNet2);
        should(info2.Id).equal(info.Id); //Update not replace

        //Add the network back to see if update works
        await mockDeploy.deploy(orig);
        //Purposely look at old container name
        const infos3 = await dockerInspect([contName], { type: "container" });
        should(infos3).be.Array().of.length(1);
        const info3 = infos3[0];
        if (info3 === undefined) throw should(info2).not.Undefined();
        should(info3.NetworkSettings.Networks).have.keys(testNet1, testNet2);
        should(info3.Id).equal(info.Id); //Update not replace
    });

    it("Should attach to default network if all explicit networks are removed", async () => {
        const orig = <DockerContainer image="alpine:3.8" networks={[testNet1, testNet2]} />;

        const { dom } = await mockDeploy.deploy(orig);
        if (dom == null) throw should(dom).not.be.Null();
        const contName = computeContainerName(dom.id, dom.buildData.deployID);

        const infos = await dockerInspect([contName], { type: "container" });
        should(infos).be.Array().of.length(1);
        const info = infos[0];
        if (info === undefined) throw should(info).not.Undefined();
        should(info.NetworkSettings.Networks).have.keys(testNet1, testNet2);

        //Remove networks to see if default becomes attached
        const removeNets = <DockerContainer image="alpine:3.8" />;
        await mockDeploy.deploy(removeNets);
        //Purposely look at old container name
        const infos2 = await dockerInspect([contName], { type: "container" });
        should(infos2).be.Array().of.length(1);
        const info2 = infos2[0];
        if (info2 === undefined) throw should(info2).not.Undefined();
        should(info2.NetworkSettings.Networks).not.have.keys(testNet1, testNet2);
        should(Object.keys(info2.NetworkSettings.Networks)).not.empty();
        should(info2.Id).equal(info.Id); //Update not replace
    });

    it("Should remove default networks if explict networks are listed", async () => {
        const orig = <DockerContainer image="alpine:3.8" />;

        const { dom } = await mockDeploy.deploy(orig);
        if (dom == null) throw should(dom).not.be.Null();
        const contName = computeContainerName(dom.id, dom.buildData.deployID);

        const infos = await dockerInspect([contName], { type: "container" });
        should(infos).be.Array().of.length(1);
        const info = infos[0];
        if (info === undefined) throw should(info).not.Undefined();
        const netKeys = Object.keys(info.NetworkSettings.Networks);
        should(netKeys).length(1);
        const defaultNet = netKeys[0];

        //Add networks to see if default is removed
        const addNets = <DockerContainer image="alpine:3.8" networks={[testNet1, testNet2]} />;
        await mockDeploy.deploy(addNets);
        //Purposely look at old container name
        const infos2 = await dockerInspect([contName], { type: "container" });
        should(infos2).be.Array().of.length(1);
        const info2 = infos2[0];
        if (info2 === undefined) throw should(info2).not.Undefined();
        should(info2.NetworkSettings.Networks).have.keys(testNet1, testNet2);
        should(info2.NetworkSettings.Networks).not.have.keys(defaultNet);
        should(info2.Id).equal(info.Id); //Update not replace
    });

    it("Should attach container to networks by network id", async () => {
        const [testNet1Id, testNet2Id] =
            (await dockerInspect([testNet1, testNet2], { type: "network" })).map((i) => i.Id);
        const orig = <DockerContainer image="alpine:3.8" networks={[testNet1Id, testNet2Id]} />;

        const { dom } = await mockDeploy.deploy(orig);
        if (dom == null) throw should(dom).not.be.Null();
        const contName = computeContainerName(dom.id, dom.buildData.deployID);

        const infos = await dockerInspect([contName], { type: "container" });
        should(infos).be.Array().of.length(1);
        const info = infos[0];
        if (info === undefined) throw should(info).not.Undefined();
        should(info.NetworkSettings.Networks).have.keys(testNet1, testNet2);
    });
});
