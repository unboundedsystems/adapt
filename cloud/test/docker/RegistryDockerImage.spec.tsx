import Adapt, { callInstanceMethod, FinalDomElement, Group, handle } from "@adpt/core";
import { mochaTmpdir } from "@adpt/testutils";
import execa from "execa";
import fs from "fs-extra";
import path from "path";
import should from "should";
import { createActionPlugin } from "../../src/action/action_plugin";
import { MockDeploy, smallDockerImage } from "../testlib";
import { checkRegistryImage, deleteAllContainers, deleteAllImages } from "./common";

import {
    adaptDockerDeployIDKey,
    computeContainerName,
    DockerBuildOptions,
    DockerContainer,
    ImageInfo,
    LocalDockerImage,
    LocalDockerRegistry,
    RegistryDockerImage,
    RegistryDockerImageProps,
} from "../../src/docker";
import {
    dockerInspect
} from "../../src/docker/cli";

describe("RegistryDockerImage", function () {
    let mockDeploy: MockDeploy;
    let pluginDir: string;

    this.timeout(60 * 1000);
    this.slow(4 * 1000);

    mochaTmpdir.all(`adapt-cloud-registrydockerimage`);

    before(async () => {
        pluginDir = path.join(process.cwd(), "plugins");
        await fs.ensureDir("ctx");
    });

    afterEach(async function () {
        this.timeout(20 * 1000);
        await deleteAllContainers(mockDeploy.deployID);
        await deleteAllImages(mockDeploy.deployID);
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
        registryUrl?: string;
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
            LABEL ${adaptDockerDeployIDKey}="${mockDeploy.deployID}"
            `,
        registryUrl: "localhost:5000",
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
                <LocalDockerRegistry portBindings={{ 5000: 5000 }} />
                <RegistryDockerImage
                    handle={iReg}
                    imageSrc={iSrc}
                    registryUrl={opts.registryUrl}
                    {...imageOpts}
                />
                <DockerContainer autoRemove={true} image={iReg} stopSignal="SIGKILL" />
            </Group>;

        return mockDeploy.deploy(orig);
    }

    async function checkBasicTest(dom: FinalDomElement | null, options: BasicDom = {}) {
        const opts = { ...defaultBasicDom(), ...options };

        if (dom == null) throw should(dom).not.be.Null();
        should(dom.props.children).be.an.Array().with.length(4);

        const iSrc = dom.props.children[0].props.handle;
        const iReg = dom.props.children[2].props.handle;

        const srcImageEl: FinalDomElement = dom.props.children[0];
        should(srcImageEl.componentType).equal(LocalDockerImage);
        const srcImageInfo = callInstanceMethod<ImageInfo | undefined>(iSrc, undefined, "latestImage");
        if (srcImageInfo == null) throw should(srcImageInfo).be.ok();

        // Info on the running container
        const ctrEl: FinalDomElement = dom.props.children[3];
        should(ctrEl.componentType).equal(DockerContainer);
        const contName = computeContainerName(ctrEl.id, mockDeploy.deployID);
        should(contName).startWith("adapt-");
        const infos = await dockerInspect([contName]);
        should(infos).be.Array().of.length(1);
        const ctrInfo = infos[0];
        if (ctrInfo == null) throw should(ctrInfo).be.ok();

        // Check image name
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
        const finalInfos = await dockerInspect([contName]);
        should(finalInfos).be.Array().of.length(0);
    }

    it("Should push a built image to registry", async () => {
        const { dom } = await deployBasicTest();
        await checkBasicTest(dom);
    });

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
});
