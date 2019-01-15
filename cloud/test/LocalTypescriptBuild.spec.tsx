import Adapt, { PrimitiveComponent } from "@usys/adapt";
import { mochaTmpdir, writePackage } from "@usys/testutils";
import execa from "execa";
import should from "should";
import { doBuild } from "./testlib";

import { TypescriptBuildProps, useAsync, useTypescriptBuild } from "../src/LocalTypescriptBuild";

//FIXME(manishv) Move to a dedicate file for useAsync
describe("useAsync hook tests", () => {
    it("Should return default and computed value", async () => {
        const val: number[] = [];
        function Test(_props: {}) {
            val.push(useAsync(async () => 10, 3));
            return null;
        }

        await Adapt.build(<Test/>, null);
        should(val).eql([3, 10]);
    });
});

async function checkDockerRun(image: string) {
    const { stdout } = await execa("docker", [ "run", "--rm", image ]);
    return stdout;
}

interface FinalProps {
    imgSha: string;
}
class Final extends PrimitiveComponent<FinalProps> {}

function TypescriptProject(props: TypescriptBuildProps) {
    const { imgSha, buildObj } = useTypescriptBuild(props.srcDir);
    return imgSha ? <Final imgSha={imgSha} /> : buildObj;
}

describe("useTypescriptBuild tests", () => {
    let imgSha: string | undefined;

    mochaTmpdir.all(`adapt-cloud-dockerbuild`);

    before(async function () {
        this.timeout(2 * 60 * 1000);
        await createProject();
    });

    after(async function () {
        this.timeout(10 * 1000);
        if (imgSha) await execa("docker", ["rmi", imgSha]);
    });

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

    it("Should build and run docker image", async function () {
        this.timeout(60 * 1000);
        this.slow(2 * 1000);

        const orig = <TypescriptProject srcDir="./testproj" />;
        const { dom } = await doBuild(orig);

        imgSha = dom.props.imgSha;
        if (imgSha === undefined) throw should(imgSha).not.be.Undefined();

        const output = await checkDockerRun(imgSha);
        should(output).equal("SUCCESS");
    });

});
