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

import Adapt, { callInstanceMethod, FinalDomElement, Group, handle } from "@adpt/core";
import { mochaTmpdir } from "@adpt/testutils";
import execa from "execa";
import fs from "fs-extra";
import path from "path";
import should from "should";
import { createActionPlugin } from "../../src/action/action_plugin";
import { MockDeploy, smallDockerImage } from "../testlib";

import {
    BuildKitImage,
    BuildKitImageProps,
    computeContainerName,
    DockerContainer,
    File,
    ImageInfo,
    RegistryDockerImageProps,
} from "../../src/docker";
import { buildKitBuild, buildKitFilesImage } from "../../src/docker/bk-cli";
import { BuildKitBuildOptions, BuildKitGlobalOptions, BuildKitOutput, BuildKitOutputRegistry, ImageStorage } from "../../src/docker/bk-types";
import {
    busyboxImage,
    dockerInspect,
} from "../../src/docker/cli";
import { buildKitHost } from "../run_buildkit";
import { registryHost } from "../run_registry";

async function checkDockerRun(image: string) {
    const { stdout } = await execa("docker", [ "run", "--rm", image ]);
    return stdout;
}

describe("buildKitFilesImage", function () {
    let regHost: string;
    let bkHost: string;

    this.timeout(60 * 1000);
    this.slow(2 * 1000);

    mochaTmpdir.all(`adapt-cloud-buildKitFilesImage`);

    before(async () => {
        regHost = await registryHost();
        bkHost = await buildKitHost();
    });

    const storage = (): ImageStorage => ({
        type: "registry",
        insecure: true,
        registry: regHost,
    });

    async function doBuildFiles(files: File[], opts: BuildKitGlobalOptions) {
        const image = await buildKitFilesImage(files, {
            ...opts,
            storage: storage(),
            buildKitHost: bkHost,
        });
        const { nameTag } = image;
        if (!nameTag) throw new Error(`No nameTag present for files image`);
        return image;
    }

    async function buildAndRun(dockerfile: string) {
        await fs.writeFile("Dockerfile", dockerfile);
        const image = await buildKitBuild("Dockerfile", ".", {
            ...storage(),
            imageName: "adapt-test-buildkitfiles",
            uniqueTag: true,
        }, {
            buildKitHost: bkHost,
        });
        const { nameTag } = image;
        if (!nameTag) throw new Error(`No nameTag present for test image`);
        return checkDockerRun(nameTag);
    }

    it("Should build an image", async () => {
        const image = await doBuildFiles([{
            path: "foo",
            contents: "foo contents\n",
        }, {
            path: "/foo1",
            contents: "foo1 contents\n",
        }, {
            path: "/dir/foo2",
            contents: "foo2 contents\n",
        }, {
            path: "dir1/foo3",
            contents: "foo3 contents\n",
        }], {});

        const output = await buildAndRun(`
            FROM ${image.nameTag} as files

            FROM ${busyboxImage}
            COPY --from=files /foo myfoo
            COPY --from=files foo1 myfoo1
            COPY --from=files dir/foo2 myfoo2
            COPY --from=files dir1/foo3 myfoo3
            CMD cat myfoo myfoo1 myfoo2 myfoo3
        `);
        should(output).equal(
`foo contents
foo1 contents
foo2 contents
foo3 contents`);
    });
});

describe("BuildKitImage", function () {
    let mockDeploy: MockDeploy;
    let pluginDir: string;
    let regHost: string;
    let bkHost: string;

    this.timeout(80 * 1000);
    this.slow(4 * 1000);

    mochaTmpdir.all(`adapt-cloud-buildkitimage`);

    before(async () => {
        pluginDir = path.join(process.cwd(), "plugins");
        regHost = await registryHost();
        bkHost = await buildKitHost();
        await fs.ensureDir("ctx");
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

    const storage = (): ImageStorage => ({
        type: "registry",
        insecure: true,
        registry: regHost,
    });

    async function buildAndRun(props: BuildKitImageProps, expected: string) {
        const orig = <BuildKitImage {...props} />;
        const { dom } = await mockDeploy.deploy(orig);
        if (dom == null) throw should(dom).not.be.Null();

        const image: ImageInfo = dom.instance.image();
        should(image).not.be.Undefined();
        const { digest, id, nameTag } = image;
        if (!nameTag) throw should(nameTag).be.ok();

        should(id).match(/^sha256:[a-f0-9]{64}$/);
        should(digest).match(RegExp(`^${regHost}/bki-test@sha256:[a-f0-9]{64}$`));
        should(nameTag).startWith(regHost);

        const output = await checkDockerRun(nameTag);
        should(output).equal(expected);

        return image;
    }

    it("Should build a registry image with an imageTag", async () => {
        await fs.writeFile("Dockerfile", `
            FROM ${busyboxImage}
            CMD echo SUCCESS1
        `);
        const props: BuildKitImageProps = {
            dockerfileName: "Dockerfile",
            options: {
                buildKitHost: bkHost,
            },
            output: {
                ...storage(),
                imageName: "bki-test",
                imageTag: "simple",
            },
        };
        const image = await buildAndRun(props, "SUCCESS1");
        should(image.nameTag).equal(`${regHost}/bki-test:simple`);
    });

    it("Should build a registry image without an imageTag", async () => {
        await fs.writeFile("Dockerfile", `
            FROM ${busyboxImage}
            CMD echo SUCCESS2
        `);
        const props: BuildKitImageProps = {
            dockerfileName: "Dockerfile",
            options: {
                buildKitHost: bkHost,
            },
            output: {
                ...storage(),
                imageName: "bki-test",
            },
        };
        const image = await buildAndRun(props, "SUCCESS2");
        should(image.nameTag).match(RegExp(`^${regHost}/bki-test@sha256:[a-f0-9]{64}$`));
    });

    it("Should build a registry image with a unique tag", async () => {
        await fs.writeFile("Dockerfile", `
            FROM ${busyboxImage}
            CMD echo SUCCESS3
        `);
        const props: BuildKitImageProps = {
            dockerfileName: "Dockerfile",
            options: {
                buildKitHost: bkHost,
            },
            output: {
                ...storage(),
                imageName: "bki-test",
                uniqueTag: true,
            },
        };
        const image = await buildAndRun(props, "SUCCESS3");
        should(image.nameTag).match(RegExp(`^${regHost}/bki-test:[a-z]{8}$`));

        // ID and tag should not change on a rebuild
        const image2 = await buildAndRun(props, "SUCCESS3");
        should(image2.nameTag).match(RegExp(`^${regHost}/bki-test:[a-z]{8}$`));
        should(image2.nameTag).equal(image.nameTag);
        should(image2.id).equal(image.id);
    });

    it("Should build using alternate file name", async () => {
        await fs.writeFile("notadockerfile", `
            FROM ${busyboxImage}
            CMD echo SUCCESS1
        `);
        const props: BuildKitImageProps = {
            dockerfileName: "notadockerfile",
            options: {
                buildKitHost: bkHost,
            },
            output: {
                ...storage(),
                imageName: "bki-test",
                imageTag: "simple",
            },
        };
        const image = await buildAndRun(props, "SUCCESS1");
        should(image.nameTag).equal(`${regHost}/bki-test:simple`);
    });

    it("Should build a registry image with files", async () => {
        const props: BuildKitImageProps = {
            dockerfile: `
                FROM ${busyboxImage}
                COPY --from=files somefile .
                CMD cat somefile
            `,
            files: [{
                path: "somefile",
                contents: "SUCCESS4",
            }],
            options: {
                buildKitHost: bkHost,
            },
            output: {
                ...storage(),
                imageName: "bki-test",
                uniqueTag: true,
            },
        };
        await buildAndRun(props, "SUCCESS4");
    });

    interface BasicDom {
        buildOpts?: BuildKitBuildOptions;
        dockerfile?: string;
        output?: BuildKitOutputRegistry;
        registryUrl?: string;
        newTag?: string;
    }
    const defaultBasicDom = () => {
        const output: BuildKitOutput = {
            ...storage(),
            imageName: "testimage",
            imageTag: "sometag",
        };
        return {
            dockerfile: `
                FROM ${smallDockerImage}
                CMD sleep 10000
                `,
            registryUrl: "localhost:5000",
            output,
        };
    };
    const defaultBuildOpts = () => ({
        buildKitHost: bkHost,
    });

    async function deployBasicTest(options: BasicDom = {}) {
        const [ iSrc ] = [ handle() ];
        const opts = { ...defaultBasicDom(), ...options };
        const buildOpts = { ...defaultBuildOpts(), ...(opts.buildOpts || {})};
        const imageOpts: Partial<RegistryDockerImageProps> = {};
        if (opts.newTag) imageOpts.newTag = opts.newTag;

        const orig =
            <Group>
                <BuildKitImage
                    handle={iSrc}
                    contextDir="ctx"
                    dockerfile={opts.dockerfile}
                    options={buildOpts}
                    output={opts.output}
                />
                {/* <RegistryDockerImage
                    handle={iReg}
                    imageSrc={iSrc}
                    registryUrl={opts.registryUrl}
                    {...imageOpts}
                /> */}
                <DockerContainer autoRemove={true} image={iSrc} stopSignal="SIGKILL" />
            </Group>;

        return mockDeploy.deploy(orig);
    }

    async function checkBasicTest(dom: FinalDomElement | null, _options: BasicDom = {}) {
        // const opts = { ...defaultBasicDom(), ...options };

        if (dom == null) throw should(dom).not.be.Null();
        // should(dom.props.children).be.an.Array().with.length(3);

        const iSrc = dom.props.children[0].props.handle;
        // const iReg = dom.props.children[1].props.children[1].props.handle;

        const srcImageEl: FinalDomElement = dom.props.children[0];
        should(srcImageEl.componentType).equal(BuildKitImage);
        const srcImageInfo = callInstanceMethod<ImageInfo | undefined>(iSrc, undefined, "latestImage");
        if (srcImageInfo == null) throw should(srcImageInfo).be.ok();

        // Info on the running container
        // const ctrEl: FinalDomElement = dom.props.children[2];
        const ctrEl: FinalDomElement = dom.props.children[1];
        should(ctrEl.componentType).equal(DockerContainer);
        const contName = computeContainerName(ctrEl.props.key, ctrEl.id, mockDeploy.deployID);
        should(contName).startWith("dockercontainer-");
        const infos = await dockerInspect([contName], { type: "container" });
        should(infos).be.Array().of.length(1);
        const ctrInfo = infos[0];
        if (ctrInfo == null) throw should(ctrInfo).be.ok();

        // Check image name
        /*
        const regImageInfo = callInstanceMethod<ImageInfo | undefined>(iReg, undefined, "latestImage");
        if (regImageInfo == null) throw should(regImageInfo).be.ok();
        should(regImageInfo.nameTag).equal(ctrInfo.Config.Image);
        const tag = opts.newTag || srcImageInfo.nameTag;
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
        */
    }

    it("Should push a built image to registry", async () => {
        const { dom } = await deployBasicTest();
        await checkBasicTest(dom);
    });

    /*
    it("Should push a built image to registry with full URL", async () => {
        const { dom } = await deployBasicTest({ registryUrl: "http://localhost:5000"});
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
    */
});
