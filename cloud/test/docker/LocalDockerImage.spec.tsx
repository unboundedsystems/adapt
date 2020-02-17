/*
 * Copyright 2019-2020 Unbounded Systems, LLC
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

import {
    DockerGlobalOptions,
    File,
    LocalDockerImage,
    LocalDockerImageProps
} from "../../src/docker";
import {
    buildFilesImage,
    dockerBuild,
} from "../../src/docker/cli";

async function checkDockerRun(image: string) {
    const { stdout } = await execa("docker", [ "run", "--rm", image ]);
    return stdout;
}

describe("buildFilesImage", function () {
    const cleanupIds: string[] = [];

    this.timeout(60 * 1000);
    this.slow(2 * 1000);

    mochaTmpdir.all(`adapt-cloud-buildFilesImage`);

    after(async function () {
        this.timeout(20 * 1000);
        await Promise.all(
            uniq(cleanupIds).map((id) => execa("docker", ["rmi", "-f", id]))
        );
    });

    async function doBuildFiles(files: File[], opts: DockerGlobalOptions) {
        const image = await buildFilesImage(files, opts);
        const { nameTag } = image;
        if (!nameTag) throw new Error(`No nameTag present for files image`);
        cleanupIds.push(nameTag);
        return image;
    }

    async function buildAndRun(dockerfile: string) {
        const image = await dockerBuild("-", ".",
            { stdin: dockerfile, imageName: "adapt-test-buildfiles", uniqueTag: true });
        const { nameTag } = image;
        if (!nameTag) throw new Error(`No nameTag present for test image`);
        cleanupIds.push(nameTag);
        return (await execa("docker", [ "run", "--rm", nameTag ])).stdout;
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
            FROM ${image.id} as files

            FROM busybox
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

describe("LocalDockerImage", function () {
    const cleanupIds: string[] = [];
    let mockDeploy: MockDeploy;
    let pluginDir: string;

    this.timeout(60 * 1000);
    this.slow(4 * 1000);

    mochaTmpdir.all(`adapt-cloud-localdockerimage`);

    before(() => {
        pluginDir = path.join(process.cwd(), "plugins");
    });

    after(async function () {
        this.timeout(20 * 1000);
        await Promise.all(
            uniq(cleanupIds).map((id) => execa("docker", ["rmi", "-f", id]))
        );
    });

    beforeEach(async () => {
        await fs.remove(pluginDir);
        mockDeploy = new MockDeploy({
            pluginCreates: [ createActionPlugin ],
            tmpDir: pluginDir,
            uniqueDeployID: true,
        });
        await mockDeploy.init();
    });

    async function buildAndRun(props: LocalDockerImageProps, expected: string) {
        const orig = <LocalDockerImage {...props} />;
        const { dom } = await mockDeploy.deploy(orig);
        if (dom == null) throw should(dom).not.be.Null();

        const image = dom.instance.image();
        should(image).not.be.Undefined();
        const id = image.id;
        should(id).match(/^sha256:[a-f0-9]{64}$/);
        cleanupIds.push(id);

        const output = await checkDockerRun(id);
        should(output).equal(expected);

        return image;
    }

    it("Should build an image", async () => {
        await fs.writeFile("Dockerfile", `
            FROM busybox
            CMD echo SUCCESS1
        `);
        const props: LocalDockerImageProps = {
            dockerfileName: "Dockerfile",
            options: {},
        };
        await buildAndRun(props, "SUCCESS1");
    });

    it("Should build an image with files", async () => {
        const props: LocalDockerImageProps = {
            dockerfile: `
                FROM busybox
                COPY --from=files somefile .
                CMD cat somefile
            `,
            files: [{
                path: "somefile",
                contents: "SUCCESS2",
            }],
            options: {},
        };
        await buildAndRun(props, "SUCCESS2");
    });
});
