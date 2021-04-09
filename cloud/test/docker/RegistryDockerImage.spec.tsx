/*
 * Copyright 2019-2021 Unbounded Systems, LLC
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

import Adapt, { callInstanceMethod, FinalDomElement, Group, handle, Sequence, useImperativeMethods } from "@adpt/core";
import { mochaTmpdir } from "@adpt/testutils";
import execa from "execa";
import fs from "fs-extra";
import path from "path";
import should from "should";
import { createActionPlugin } from "../../src/action/action_plugin";
import { MockDeploy, smallDockerImage } from "../testlib";
import { checkRegistryImage, deleteAllContainers, deleteAllImages, deployIDFilter } from "./common";

import {
    computeContainerName,
    DockerBuildOptions,
    DockerContainer,
    LocalDockerImage,
    LocalDockerRegistry,
    RegistryDockerImage,
    RegistryDockerImageProps,
} from "../../src/docker";
import {
    dockerInspect
} from "../../src/docker/cli";
import { imageRef, ImageRef } from "../../src/docker/image-ref";

describe("RegistryDockerImage", function () {
    let mockDeploy: MockDeploy;
    let pluginDir: string;

    this.timeout(80 * 1000);
    this.slow(4 * 1000);

    mochaTmpdir.all(`adapt-cloud-registrydockerimage`);

    before(async () => {
        pluginDir = path.join(process.cwd(), "plugins");
        await fs.ensureDir("ctx");
    });

    afterEach(async function () {
        this.timeout(20 * 1000);
        const filter = deployIDFilter(mockDeploy.deployID);
        await deleteAllContainers(filter);
        await deleteAllImages(filter);
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

    interface BasicDom {
        buildOpts?: DockerBuildOptions;
        dockerfile?: string;
        registryPrefix?: string;
        newTag?: string;
    }
    const defaultBuildOpts = {
        imageName: "testimage",
        uniqueTag: true,
    };
    const defaultBasicDom = () => ({
        dockerfile: `
            FROM ${smallDockerImage}
            CMD sleep 10000
            `,
        registryPrefix: "localhost:5000",
    });

    async function deployBasicTest(options: BasicDom = {}) {
        const [ iSrc, iReg ] = [ handle(), handle() ];
        const opts = { ...defaultBasicDom(), ...options };
        const buildOpts = { ...defaultBuildOpts, ...(opts.buildOpts || {})};
        const imageOpts: Partial<RegistryDockerImageProps> = {};
        if (opts.newTag) imageOpts.newTag = opts.newTag;

        const orig =
            <Group>
                <LocalDockerImage
                    handle={iSrc}
                    contextDir="ctx"
                    dockerfile={opts.dockerfile}
                    options={buildOpts}
                />
                <Sequence>
                    <LocalDockerRegistry portBindings={{ 5000: 5000 }} />
                    <RegistryDockerImage
                        handle={iReg}
                        imageSrc={iSrc}
                        registryPrefix={opts.registryPrefix}
                        {...imageOpts}
                    />
                </Sequence>
                <DockerContainer autoRemove={true} image={iReg} stopSignal="SIGKILL" />
            </Group>;

        return mockDeploy.deploy(orig);
    }

    async function checkBasicTest(dom: FinalDomElement | null, options: BasicDom = {}) {
        const opts = { ...defaultBasicDom(), ...options };

        if (dom == null) throw should(dom).not.be.Null();
        should(dom.props.children).be.an.Array().with.length(3);

        const iSrc = dom.props.children[0].props.handle;
        const iReg = dom.props.children[1].props.children[1].props.handle;

        const srcImageEl: FinalDomElement = dom.props.children[0];
        should(srcImageEl.componentType).equal(LocalDockerImage);
        const srcImageInfo = callInstanceMethod<ImageRef | undefined>(iSrc, undefined, "latestImage");
        if (srcImageInfo == null) throw should(srcImageInfo).be.ok();

        // Info on the running container
        const ctrEl: FinalDomElement = dom.props.children[2];
        should(ctrEl.componentType).equal(DockerContainer);
        const contName = computeContainerName(ctrEl.props.key, ctrEl.id, mockDeploy.deployID);
        should(contName).startWith("dockercontainer-");
        const infos = await dockerInspect([contName], { type: "container" });
        should(infos).be.Array().of.length(1);
        const ctrInfo = infos[0];
        if (ctrInfo == null) throw should(ctrInfo).be.ok();

        // Check image name
        const regImageInfo = callInstanceMethod<ImageRef | undefined>(iReg, undefined, "latestImage");
        if (regImageInfo == null) throw should(regImageInfo).be.ok();
        should(regImageInfo.nameTag).equal(ctrInfo.Config.Image);
        let tag = opts.newTag || srcImageInfo.pathTag;
        if (!tag) throw should(tag).be.ok();
        if (!tag.includes(":")) tag += ":latest";
        should(regImageInfo.nameTag).equal(`localhost:5000/${tag}`);
        should(regImageInfo.id).equal(ctrInfo.Image);

        // Stop the container so we can delete its image
        await execa("docker", ["rm", "-f", contName]);
        if (!regImageInfo.nameTag) throw should(regImageInfo.nameTag).be.ok();
        await checkRegistryImage(regImageInfo.nameTag);

        //Delete
        await mockDeploy.deploy(null);
        const finalInfos = await dockerInspect([contName], { type: "container" });
        should(finalInfos).be.Array().of.length(0);
    }

    it("Should push a built image to registry", async () => {
        const { dom } = await deployBasicTest();
        await checkBasicTest(dom);
    });

    it("Should push a built image to registry with full URL", async () => {
        const { dom } = await deployBasicTest({ registryPrefix: "http://localhost:5000"});
        await checkBasicTest(dom);
    });

    it("Should push a built image to registry with new tag", async () => {
        const opts = {
            newTag: "myimage",
            // No tag
            buildOpts: { imageName: undefined, uniqueTag: false}
        };
        const { dom } = await deployBasicTest(opts);
        await checkBasicTest(dom, opts);
    });

    async function checkWithMockImage(srcRef: string, expectedRef: string, registry: string) {
        const [ iSrc ] = [ handle() ];
        const imageOpts: Partial<RegistryDockerImageProps> = {};

        let destRef: string | undefined;
        function MockDockerImage() {
            useImperativeMethods(() => ({
                latestImage: () => imageRef(srcRef),
                pushTo: ({ ref }: { ref: string }) => {
                    destRef = ref;
                    const ret = imageRef(ref, true);
                    return imageRef(ret);
                }
            }));
            return null;
        }

        const orig =
            <Group>
                <MockDockerImage handle={iSrc} />
                <RegistryDockerImage
                        imageSrc={iSrc}
                        registryPrefix={registry}
                        {...imageOpts}
                />
            </Group>;

        await mockDeploy.deploy(orig);
        should(destRef).eql(expectedRef);
    }

    it("Should allow registry with path", async () => {
        const registry = "test.adaptjs.org/foo/bar";
        const data = [
            { srcRef: "some/path/basename", expected: `${registry}/basename:latest` },
            { srcRef: "some/path/basename:tag", expected: `${registry}/basename:tag` },
            { srcRef: "foo.com/basename", expected: `${registry}/basename:latest` },
            { srcRef: "basename", expected: `${registry}/basename:latest` },
            { srcRef: "basename:tag", expected: `${registry}/basename:tag` },
            { srcRef: "basename-r:tag", expected: `${registry}/basename-r:tag`, registry: registry + "/"},
        ];
        for (const i of data) {
            await checkWithMockImage(i.srcRef, i.expected, i.registry ?? registry);
        }
    });

});
