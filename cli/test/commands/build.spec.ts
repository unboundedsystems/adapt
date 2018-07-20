import { expect, test } from "@oclif/test";
import * as fs from "fs-extra";
import * as path from "path";
import * as tmpdir from "../testlib/mocha-tmpdir";

import { localRegistryUrl } from "../common/config";

const basicPackageJson = {
    name: "test",
    version: "1.0.0",
    description: "Adapt project",
    main: "dist/index.js",
    scripts: {},
    author: "",
    license: "UNLICENSED",
    dependencies: {
        "typescript": "^2.8.3",
        "@types/node": "^8.10",
        "@usys/adapt": "0.0.1",
    },
};

const basicIndexTsx = `
    import Adapt, { PrimitiveComponent } from "@usys/adapt";

    class Root extends PrimitiveComponent<{}> { }

    const app = <Root />;
    Adapt.stack("dev", app);
`;

async function createProject(pkgJson: any, tsFile: string,
                             tsFilename: string): Promise<void> {
    await fs.writeJson("package.json", pkgJson, {spaces: 2});
    await fs.outputFile(tsFilename, tsFile);
}

function fakeWindowSize() {
    return [80, 40];
}

describe("Build basic tests", () => {
    tmpdir.each("adapt-cli-test-build");

    test
    .do(async () => {
        await createProject(basicPackageJson, basicIndexTsx, "index.tsx");
    })
    .stub(process.stdout, "isTTY", false) // Turn off progress, etc
    .stdout()
    .stderr()
    .command(["build", "--registry", localRegistryUrl, "dev"])

    .it("Should build basic default filename", (ctx) => {
        expect(ctx.stderr).equals("");
        expect(ctx.stdout).contains("Validating project [completed]");
        expect(ctx.stdout).contains("Building project [completed]");
        expect(ctx.stdout).contains(`DOM for stack 'dev':
<Adapt>
  <Root key="Root">
    <__props__>
      <prop name="store">{}</prop>
    </__props__>
  </Root>
</Adapt>`);
    });

    test
    .do(async () => {
        await createProject(basicPackageJson, basicIndexTsx, "index.tsx");
    })
    .stub(process.stdout, "isTTY", true) // Ensure TTY-flavored output on stdout
    .stub(process.stdout, "getWindowSize", fakeWindowSize)
    .stdout()
    .stderr()
    .command(["build", "--registry", localRegistryUrl, "dev"])

    .it("Should build basic with TTY output", (ctx) => {
        expect(ctx.stdout).contains("✔ Validating project");
        expect(ctx.stdout).contains("✔ Building project");
        expect(ctx.stderr).equals("");
    });
});

describe("Build negative tests", () => {
    tmpdir.each("adapt-cli-test-build");

    test
    .stdout()
    .stderr()
    .command(["build", "--rootFile", "doesntexist", "dev"])
    .catch((err: any) => {
        expect(err.oclif).is.an("object");
        expect(err.oclif.exit).equals(2);
        expect(err.message).contains(
            "Project file 'doesntexist' does not exist");
    })
    .it("Should fail if file doesn't exist");

    test
    .do(() => {
        return fs.ensureFile(path.join(process.cwd(), "test.ts"));
    })
    .stdout()
    .stderr()
    .command(["build", "--rootFile", "test.ts", "dev"])
    .catch((err: any) => {
        expect(err.oclif).is.an("object");
        expect(err.oclif.exit).equals(2);
        expect(err.message).contains(
            `The directory '${process.cwd()}' does not contain a package.json file`);
    })
    .it("Should fail if package.json doesn't exist");
});
