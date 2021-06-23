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

import Adapt, { FinalDomElement, handle, PrimitiveComponent, Sequence, useMethod } from "@adpt/core";
import { mochaTmpdir, writePackage } from "@adpt/testutils";
import execa from "execa";
import fs from "fs-extra";
import { uniq } from "lodash";
import path from "path";
import should from "should";
import { createActionPlugin } from "../../src/action/action_plugin";
import { deleteAllImages, deployIDFilter } from "../docker/common";
import { MockDeploy } from "../testlib";

import { DockerImageInstance } from "../../src/docker";
import { hasId } from "../../src/docker/image-ref";
import {
    LocalNodeImage,
    NodeImageBuildOptions,
} from "../../src/nodejs";

async function checkDockerRun(image: string, ...args: string[]) {
    const { stdout } = await execa("docker", ["run", "--rm", image, ...args]);
    return stdout;
}

interface FinalProps {
    id: string;
    tag?: string;
}
class Final extends PrimitiveComponent<FinalProps> {
    static noPlugin = true;
}

describe("LocalNodeImage tests", function () {
    let imageIds: string[];
    let mockDeploy: MockDeploy;
    let pluginDir: string;
    const deployIDs: string[] = [];

    this.timeout(60 * 1000);
    this.slow(2 * 1000);

    mochaTmpdir.all(`adapt-cloud-dockerbuild`);

    before(async function () {
        this.timeout(2 * 60 * 1000);
        await createProject();
        await createWorkspaceProject();
        pluginDir = path.join(process.cwd(), "plugins");
    });

    after(async function () {
        this.timeout(20 * 1000);
        for (const id of deployIDs) {
            await deleteAllImages(deployIDFilter(id));
        }
    });

    beforeEach(async () => {
        imageIds = [];
        await fs.remove(pluginDir);
        mockDeploy = new MockDeploy({
            pluginCreates: [createActionPlugin],
            tmpDir: pluginDir,
            uniqueDeployID: true,
        });
        await mockDeploy.init();
        deployIDs.push(mockDeploy.deployID);
    });

    interface TypescriptBuildProps {
        srcDir: string;
        options?: NodeImageBuildOptions;
    }

    function TypescriptProject(props: TypescriptBuildProps) {
        const img = handle<DockerImageInstance>();
        const image = useMethod(img, "image");
        if (image && !hasId(image)) throw new Error(`Image has no ID`);
        if (image) imageIds.push(image.id);

        return (
            <Sequence>
                <LocalNodeImage handle={img}
                    srcDir={props.srcDir}
                    options={{
                        imageName: "tsservice",
                        runNpmScripts: "build",
                        ...props.options
                    }} />
                {image ? <Final id={image.id} tag={image.nameTag} /> : null}
            </Sequence>
        );
    }

    const pkgJson = {
        name: "testproject",
        version: "0.0.1",
        main: "dist/index.js",
        scripts: {
            "build": "tsc && npm run build-test-var",
            "build-test-var": `printf '#!/usr/bin/env bash'"\\necho \${TEST_VAR}\\n" > /test-var.sh && chmod 755 /test-var.sh`
        },
        devDependencies: {
            typescript: "3.2.x"
        }
    };
    const tsConfig = JSON.stringify({
        compilerOptions: {
            outDir: "./dist/",
        },
        include: [
            "."
        ]
    }, null, 2);
    const indexTs = `
        function main(): void {
            console.log("SUCCESS");
        }
        main();
    `;

    const numWorkspaces = 5; // Must be at least 1 and less than 10
    const pkgJsonWorkspaces = {
        name: "testprojectworkspaces",
        private: true,
        version: "0.0.1",
        scripts: {
            build: "yarn workspaces run build",
        },
        workspaces: [ "workspace1", "workspace2", "**/workspace[3-9]" ],
    };

    async function createProject() {
        await writePackage("./testProj", {
            pkgJson,
            files: {
                "index.ts": indexTs,
                "tsconfig.json": tsConfig,
            }
        });
    }

    async function createWorkspaceProject() {
        await writePackage("./testProjWorkspaces", {
            pkgJson: pkgJsonWorkspaces,
            files: {
                ".dockerignore": "workspace5"
            }
        });
        for (let i = 1; i <= numWorkspaces; i++) {
            const ws = `workspace${i}`;
            const name = `testproject-${ws}`;
            const dependencies = (i === 3) ? { "is-regexp": "^2.1.0" } : undefined;
            const indexContents = (() => {
                switch (i) {
                    case 1: return indexTs;
                    case 3: return `import isRegexp = require("is-regexp");\nconsole.log(isRegexp(/foo/))`;
                    default: return indexTs.replace("SUCCESS", `SUCCESS${i}`);
                }
            })();

            await writePackage(`./testProjWorkspaces/${ws}`, {
                pkgJson: {
                    ...pkgJson,
                    name,
                    dependencies,
                },
                files: {
                    "index.ts": indexContents,
                    "tsconfig.json": tsConfig,
                }
            });
        }
    }

    const imgName = (options?: NodeImageBuildOptions | undefined) =>
        ` '${(options && options.imageName) || "tsservice"}'`;

    async function basicTest(optionsIn?: NodeImageBuildOptions & {
        project?: "testProj" | "testProjWorkspaces",
        outputCheck?: boolean
    }) {
        const { outputCheck =  true, project = "testProj", ...options } = optionsIn || {};
        const orig = <TypescriptProject srcDir={`./${project}`} options={options} />;
        const { dom } = await mockDeploy.deploy(orig);
        if (dom == null) throw should(dom).not.be.Null();

        const img = imgName(options);

        const { stdout } = mockDeploy.logger;
        should(stdout).equal(`INFO: Doing Building Docker image${img}\n`);

        should(dom.props.children).be.an.Array().with.length(2);
        const final: FinalDomElement = dom.props.children[1];
        should(final.componentName).equal("Final");

        const { id, tag } = final.props;
        if (id === undefined) throw should(id).not.be.Undefined();
        if (tag === undefined) throw should(tag).not.be.Undefined();
        should(id).match(/^sha256:[a-f0-9]{64}$/);

        let output = await checkDockerRun(id);
        if (outputCheck) should(output).equal("SUCCESS");

        output = await checkDockerRun(tag);
        if (outputCheck) should(output).equal("SUCCESS");

        return { id, tag };
    }

    it("Should build and run docker image", async () => {
        const { id, tag } = await basicTest();
        should(tag).match(/^tsservice:[a-z]{8}$/);
        should(uniq(imageIds)).eql([id]);
        const output = await checkDockerRun(id, "node", "--version");
        should(output).startWith("v14");
    });

    it("Should build and run docker image with different node version", async () => {
        const { id } = await basicTest({ nodeVersion: 12 });
        const output = await checkDockerRun(id, "node", "--version");
        should(output).startWith("v12");
    });

    it("Should build and run docker image with different base image", async () => {
        const { id } = await basicTest({ baseImage: "node:15-buster-slim" });
        const output = await checkDockerRun(id, "node", "--version");
        should(output).startWith("v15");
    });

    it("Should use custom name and base tag", async () => {
        const options = {
            imageName: "myimage",
            imageTag: "foo",
        };
        const { id, tag } = await basicTest(options);
        should(tag).match(/^myimage:foo-[a-z]{8}$/);
        should(uniq(imageIds)).eql([id]);
    });

    it("Should use custom name and non-random tag", async () => {
        const options = {
            imageName: "myimage",
            imageTag: "bar",
            uniqueTag: false,
        };
        const { id, tag } = await basicTest(options);
        should(tag).equal("myimage:bar");
        should(uniq(imageIds)).eql([id]);
    });

    it("Should expose buildArgs during build", async () => {
        const testVarValue = "This is a test";
        const { id } = await basicTest({
            buildArgs: { TEST_VAR: testVarValue }
        });
        const output = await checkDockerRun(id, "/test-var.sh");
        should(output).equal(testVarValue);
    });

    it("Should allow a custom command string", async () => {
        const testVarValue = "This is a test";
        const { id } = await basicTest({
            cmd: "node --version",
            buildArgs: { TEST_VAR: testVarValue },
            outputCheck: false,
        });
        const output = await checkDockerRun(id);
        should(output).startWith("v14");
    });

    it("Should allow a custom command array", async () => {
        const testVarValue = "This is a test";
        const { id } = await basicTest({
            cmd: ["node", "--version"],
            buildArgs: { TEST_VAR: testVarValue },
            outputCheck: false,
        });
        const output = await checkDockerRun(id);
        should(output).startWith("v14");
    });

    it("Should use yarn as package manager", async () => {
        const { id } = await basicTest({ packageManager: "yarn" });
        const output = await checkDockerRun(id, "node", "--version");
        should(output).startWith("v14");
    });

    it("Should allow yarn workspaces", async () => {
        const { id } = await basicTest({
            cmd: ["node", "/app/workspace1/dist/index.js"],
            packageManager: "yarn",
            project: "testProjWorkspaces",
        });

        for (let i = 2; i <= numWorkspaces; i++) {
            switch (i) {
                case 3:
                    const reVal = await checkDockerRun(id, "node", `/app/workspace${i}/dist/index.js`);
                    should(reVal).equal(`true`);
                    break;
                case 5: continue; //This is in .dockerignore, so skip it
                default:
                    const output = await checkDockerRun(id, "node", `/app/workspace${i}/dist/index.js`);
                    should(output).equal(`SUCCESS${i}`);
                    break;
            }
        }
    });
});
