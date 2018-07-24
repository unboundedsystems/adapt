import { expect, test as oclifTest } from "@oclif/test";
import * as fs from "fs-extra";
import * as path from "path";
import * as tmpdir from "../testlib/mocha-tmpdir";

import { localRegistryUrl } from "../common/config";

import { defaultStateHistoryDir } from "../../src/commands/build";
import {
    domFilename,
    infoFilename,
    stateFilename
} from "../../src/proj/statehistory";

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

function fakeWindowSize() {
    return [80, 40];
}

async function createProject(pkgJson: any, tsFile: string,
                             tsFilename: string): Promise<void> {
    await fs.writeJson("package.json", pkgJson, {spaces: 2});
    await fs.outputFile(tsFilename, tsFile);
}

const testBase =
    oclifTest
    .stub(process.stdout, "isTTY", false) // Turn off progress, etc
    .stdout()
    .stderr();

const testBaseTty =
    oclifTest
    .stub(process.stdout, "isTTY", true) // Ensure TTY-flavored output on stdout
    .stub(process.stdout, "getWindowSize", fakeWindowSize)
    .stdout()
    .stderr();

/*
 * Basic tests
 */

const basicIndexTsx = `
    import Adapt, { PrimitiveComponent } from "@usys/adapt";

    class Root extends PrimitiveComponent<{}> { }

    const app = <Root />;
    Adapt.stack("dev", app);
`;

async function checkBasicIndexTsxState(historyDir: string): Promise<void> {
    const fileList = await fs.readdir(historyDir);
    expect(fileList).to.be.an("array").that.includes(infoFilename);
    expect(fileList.length).equals(2);
    // Remove infoFilename from fileList
    fileList.splice(fileList.indexOf(infoFilename), 1);

    const dir = path.join(historyDir, fileList[0]);

    const domXml = await fs.readFile(path.join(dir, domFilename));
    expect(domXml.toString()).equals(
`<Adapt>
  <Root key="Root"/>
</Adapt>
`);
    const state = await fs.readJson(path.join(dir, stateFilename));
    expect(state).eqls({});

    const info = await fs.readJson(path.join(historyDir, infoFilename));
    expect(info).eqls({
        version: 1,
        stateDirs: [ fileList[0] ],
    });
}

const basicTestChain =
    testBase
    .do(async () => {
        await createProject(basicPackageJson, basicIndexTsx, "index.tsx");
    });

describe("Build basic tests", function() {
    this.timeout(20000);
    tmpdir.each("adapt-cli-test-build");

    basicTestChain
    .command(["build", "--registry", localRegistryUrl, "--init", "dev"])

    .it("Should build basic default filename", async (ctx) => {
        expect(ctx.stderr).equals("");
        expect(ctx.stdout).contains("Opening state history [completed]");
        expect(ctx.stdout).contains("Validating project [completed]");
        expect(ctx.stdout).contains("Building project [completed]");

        await checkBasicIndexTsxState(defaultStateHistoryDir);
    });

    testBaseTty
    .do(async () => {
        await createProject(basicPackageJson, basicIndexTsx, "index.tsx");
    })
    .command(["build", "--registry", localRegistryUrl, "--init", "dev"])

    .it("Should build basic with TTY output", async (ctx) => {
        expect(ctx.stderr).equals("");
        expect(ctx.stdout).contains("✔ Opening state history");
        expect(ctx.stdout).contains("✔ Validating project");
        expect(ctx.stdout).contains("✔ Building project");

        await checkBasicIndexTsxState(defaultStateHistoryDir);
    });
});

/*
 * State update tests
 */

function stateUpdateIndexTsx(initialStateStr: string, newStateStr: string) {
    return `
    import Adapt, { AnyState, Component, PrimitiveComponent } from "@usys/adapt";

    class Empty extends PrimitiveComponent<{ id: number }> { }

    interface StateUpdaterProps {
        newState: (prev: any, props: StateUpdaterProps) => any;
        initialState: any;
    }

    class StateUpdater extends Component<StateUpdaterProps, AnyState> {

        build() {
            this.setState(this.props.newState);
            return <Empty id={1} />;
        }
    }

    const initialState = ${initialStateStr};
    const newState = ${newStateStr};

    const app = <StateUpdater newState={newState} initialState={initialState} />;
    Adapt.stack("dev", app);
`;
}

async function checkStateUpdateState(historyDir: string, count: number): Promise<void> {
    const fileList = await fs.readdir(historyDir);
    expect(fileList).to.be.an("array").that.includes(infoFilename);
    expect(fileList.length).equals(1 + count);
    // Remove infoFilename from fileList
    fileList.splice(fileList.indexOf(infoFilename), 1);

    fileList.sort();
    for (let i = 0; i < count; i++) {
        const dirName = fileList[i];

        const matches = dirName.match(/^(\d{5})-/);
        expect(matches).to.be.an("array").with.lengthOf(2);
        if (matches == null) return;
        expect(parseInt(matches[1], 10)).to.equal(i);

        const dir = path.join(historyDir, dirName);

        const domXml = await fs.readFile(path.join(dir, domFilename));
        expect(domXml.toString()).equals(
`<Adapt>
  <Empty id="1">
    <__props__>
      <prop name="key">"StateUpdater-Empty"</prop>
    </__props__>
  </Empty>
</Adapt>
`);
        const state = await fs.readJson(path.join(dir, stateFilename));
        expect(state).eqls({
            '["StateUpdater"]': { count: i + 1 }
        });
    }

    const info = await fs.readJson(path.join(historyDir, infoFilename));
    expect(info.version).equals(1);
    expect(info.stateDirs).to.have.members(fileList);
}

const stateIncrementTestChain =
    testBase
    .do(async () => {
        const indexTsx = stateUpdateIndexTsx("{count: 1}",
            `(prev: any, props) => {
                if (prev === undefined) return props.initialState;
                return { count: prev.count + 1 };
            }`);
        await createProject(basicPackageJson, indexTsx, "index.tsx");
    });

describe("Build state update tests", () => {
    // These tests must all use a single temp directory where the
    // state_history can be shared and built upon
    tmpdir.all("adapt-cli-test-build");

    stateIncrementTestChain
    .command(["build", "--registry", localRegistryUrl, "--init", "dev"])

    .it("Should create initial state", async (ctx) => {
        expect(ctx.stderr).equals("");
        expect(ctx.stdout).contains("Opening state history [completed]");
        expect(ctx.stdout).contains("Validating project [completed]");
        expect(ctx.stdout).contains("Building project [completed]");

        await checkStateUpdateState(defaultStateHistoryDir, 1);
    });

    stateIncrementTestChain
    .command(["build", "--registry", localRegistryUrl, "dev"])

    .it("Should create second state", async (ctx) => {
        expect(ctx.stderr).equals("");
        expect(ctx.stdout).contains("Opening state history [completed]");
        expect(ctx.stdout).contains("Validating project [completed]");
        expect(ctx.stdout).contains("Building project [completed]");

        await checkStateUpdateState(defaultStateHistoryDir, 2);
    });

    stateIncrementTestChain
    .command(["build", "--registry", localRegistryUrl, "dev"])

    .it("Should create third state", async (ctx) => {
        expect(ctx.stderr).equals("");
        expect(ctx.stdout).contains("Opening state history [completed]");
        expect(ctx.stdout).contains("Validating project [completed]");
        expect(ctx.stdout).contains("Building project [completed]");

        await checkStateUpdateState(defaultStateHistoryDir, 3);
    });
});

describe("Build negative tests", () => {
    tmpdir.each("adapt-cli-test-build");

    testBase
    .command(["build", "--rootFile", "doesntexist", "dev"])
    .catch((err: any) => {
        expect(err.oclif).is.an("object");
        expect(err.oclif.exit).equals(2);
        expect(err.message).contains(
            "Project file 'doesntexist' does not exist");
    })
    .it("Should fail if file doesn't exist");

    testBase
    .do(() => {
        return fs.ensureFile(path.join(process.cwd(), "test.ts"));
    })
    .command(["build", "--rootFile", "test.ts", "--init", "dev"])
    .catch((err: any) => {
        expect(err.oclif).is.an("object");
        expect(err.oclif.exit).equals(2);
        expect(err.message).contains(
            `The directory '${process.cwd()}' does not contain a package.json file`);
    })
    .it("Should fail if package.json doesn't exist", (ctx) => {
        expect(ctx.stderr).equals("");
        expect(ctx.stdout).contains("Opening state history [completed]");
        expect(ctx.stdout).contains("This project cannot be built");
        expect(ctx.stdout).contains(
            `The directory '${process.cwd()}' does not contain a package.json file`);
        expect(fs.pathExists(defaultStateHistoryDir)).to.eventually.be.false;
    });
});
