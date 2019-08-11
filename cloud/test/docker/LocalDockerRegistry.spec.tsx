import Adapt from "@adpt/core";
import { mochaTmpdir } from "@adpt/testutils";
import execa from "execa";
import fs from "fs-extra";
import { uniq } from "lodash";
import path from "path";
import should from "should";
import { createActionPlugin } from "../../src/action/action_plugin";
import { MockDeploy, smallDockerImage } from "../testlib";
import { deleteAllContainers } from "./common";

import {
    computeContainerName,
    LocalDockerRegistry,
} from "../../src/docker";
import {
    dockerInspect,
    dockerPull,
    dockerPush,
    dockerRemoveImage,
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

        // Remove the tag and ensure it's gone
        await dockerRemoveImage({ nameOrId: registryTag });
        let regTagInfo = await dockerInspect([registryTag]);
        should(regTagInfo).be.Array().of.length(0);

        // Now pull the tag and verify it's back
        await dockerPull({ imageName: registryTag });
        regTagInfo = await dockerInspect([registryTag]);
        should(regTagInfo).be.Array().of.length(1);

        //Delete
        await mockDeploy.deploy(null);
        const finalInfos = await dockerInspect([contName]);
        should(finalInfos).be.Array().of.length(0);
    });

});
