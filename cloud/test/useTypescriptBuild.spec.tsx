import Adapt, { FinalDomElement, Group, PrimitiveComponent } from "@usys/adapt";
import { mochaTmpdir, writePackage } from "@usys/testutils";
import execa from "execa";
import fs from "fs-extra";
import { uniq } from "lodash";
import path from "path";
import should from "should";
import { createActionPlugin } from "../src/action/action_plugin";
import { MockDeploy } from "./testlib";

import {
    TypescriptBuildOptions,
    useTypescriptBuild,
} from "../src/useTypescriptBuild";

async function checkDockerRun(image: string) {
    const { stdout } = await execa("docker", [ "run", "--rm", image ]);
    return stdout;
}

interface FinalProps {
    id: string;
    tag?: string;
}
class Final extends PrimitiveComponent<FinalProps> {
    static noPlugin = true;
}

describe("useTypescriptBuild tests", function () {
    const cleanupIds: string[] = [];
    let imageIds: string[];
    let mockDeploy: MockDeploy;
    let pluginDir: string;

    this.timeout(60 * 1000);
    this.slow(2 * 1000);

    mochaTmpdir.all(`adapt-cloud-dockerbuild`);

    before(async function () {
        this.timeout(2 * 60 * 1000);
        await createProject();
        pluginDir = path.join(process.cwd(), "plugins");
    });

    after(async function () {
        this.timeout(20 * 1000);
        await Promise.all(
            uniq(cleanupIds).map((id) => execa("docker", ["rmi", "-f", id]))
        );
    });

    beforeEach(async () => {
        imageIds = [];
        await fs.remove(pluginDir);
        mockDeploy = new MockDeploy({
            pluginCreates: [ createActionPlugin ],
            tmpDir: pluginDir,
        });
        await mockDeploy.init();
    });

    interface TypescriptBuildProps {
        srcDir: string;
        options?: TypescriptBuildOptions;
    }

    function TypescriptProject(props: TypescriptBuildProps) {
        const { image, buildObj } = useTypescriptBuild(props.srcDir, props.options);
        if (image) {
            imageIds.push(image.id);
            cleanupIds.push(image.id);
        }
        return (
            <Group>
                {buildObj}
                {image ? <Final id={image.id} tag={image.nameTag} /> : null}
            </Group>
        );
    }

    const pkgJson = {
        name: "testproject",
        version: "0.0.1",
        main: "dist/index.js",
        scripts: {
            build: "tsc",
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

    async function createProject() {
        await writePackage("./testproj", {
            pkgJson,
            files: {
                "index.ts": indexTs,
                "tsconfig.json": tsConfig,
            }
        });
    }

    const imgName = (options?: TypescriptBuildOptions | undefined) =>
        ` '${(options && options.imageName) || "tsservice"}'`;

    async function basicTest(options?: TypescriptBuildOptions) {
        const orig = <TypescriptProject srcDir="./testproj" options={options} />;
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
        should(output).equal("SUCCESS");

        output = await checkDockerRun(tag);
        should(output).equal("SUCCESS");

        return { id, tag };
    }

    it("Should build and run docker image", async () => {
        const { id, tag } = await basicTest();
        should(tag).match(/^tsservice:[a-z]{8}$/);
        should(imageIds).eql([ id ]);
    });

    it("Should use custom name and base tag", async () => {
        const options = {
            imageName: "myimage",
            imageTag: "foo",
        };
        const { id, tag } = await basicTest(options);
        should(tag).match(/^myimage:foo-[a-z]{8}$/);
        should(imageIds).eql([ id ]);
    });

    it("Should use custom name and non-random tag", async () => {
        const options = {
            imageName: "myimage",
            imageTag: "bar",
            uniqueTag: false,
        };
        const { id, tag } = await basicTest(options);
        should(tag).equal("myimage:bar");
        should(imageIds).eql([ id ]);
    });
});
