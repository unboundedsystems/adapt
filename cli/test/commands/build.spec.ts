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

describe("Build basic tests", () => {
    tmpdir.each("adapt-cli-test-build");

    test
    .do(async () => {
        await createProject(basicPackageJson, basicIndexTsx, "index.tsx");
    })
    .stub(process.stdout, "isTTY", true) // Ensure TTY-flavored output on stdout
    .stdout()
    .stderr()
    .command(["build", "--registry", localRegistryUrl])
    .it("Should build basic default filename", (ctx) => {
        expect(ctx.stdout).contains("✔ Validating project");
        expect(ctx.stdout).contains("✔ Building project");
    });
});

describe("Build negative tests", () => {
    tmpdir.each("adapt-cli-test-build");

    test
    .stdout()
    .stderr()
    .command(["build", "doesntexist"])
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
    .command(["build", "test.ts"])
    .catch((err: any) => {
        expect(err.oclif).is.an("object");
        expect(err.oclif.exit).equals(2);
        expect(err.message).contains(
            `The directory '${process.cwd()}' does not contain a package.json file`);
    })
    .it("Should fail if package.json doesn't exist");
});
