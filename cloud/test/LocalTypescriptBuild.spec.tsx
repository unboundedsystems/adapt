import Adapt, { PrimitiveComponent } from "@usys/adapt";
import { mochaTmpdir, writePackage } from "@usys/testutils";
import execa from "execa";
import { uniq } from "lodash";
import should from "should";
import { doBuild } from "./testlib";

import {
    TypescriptBuildOptions,
    TypescriptBuildProps,
    useTypescriptBuild,
} from "../src/LocalTypescriptBuild";

async function checkDockerRun(image: string) {
    const { stdout } = await execa("docker", [ "run", "--rm", image ]);
    return stdout;
}

interface FinalProps {
    id: string;
    tag?: string;
}
class Final extends PrimitiveComponent<FinalProps> {}

describe("useTypescriptBuild tests", function () {
    const imageIds: string[] = [];

    this.timeout(60 * 1000);
    this.slow(2 * 1000);

    mochaTmpdir.all(`adapt-cloud-dockerbuild`);

    before(async function () {
        this.timeout(2 * 60 * 1000);
        await createProject();
    });

    after(async function () {
        this.timeout(20 * 1000);
        await Promise.all(
            uniq(imageIds).map((id) => execa("docker", ["rmi", "-f", id]))
        );
    });

    function TypescriptProject(props: TypescriptBuildProps) {
        const { image, buildObj } = useTypescriptBuild(props.srcDir, props.options);
        if (image) imageIds.push(image.id);
        return image ? <Final id={image.id} tag={image.nameTag} /> : buildObj;
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

    async function basicTest(options?: TypescriptBuildOptions) {
        const orig = <TypescriptProject srcDir="./testproj" options={options} />;
        const { dom } = await doBuild(orig);

        const { id, tag } = dom.props;
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
        const { tag } = await basicTest();
        should(tag).match(/^tsservice:[a-z]{8}$/);
    });

    it("Should use custom name and base tag", async () => {
        const options = {
            imageName: "myimage",
            imageTag: "foo",
        };
        const { tag } = await basicTest(options);
        should(tag).match(/^myimage:foo-[a-z]{8}$/);
    });

    it("Should use custom name and non-random tag", async () => {
        const options = {
            imageName: "myimage",
            imageTag: "bar",
            uniqueTag: false,
        };
        const { tag } = await basicTest(options);
        should(tag).equal("myimage:bar");
    });
});
