import { filePathToUrl, localRegistryDefaults, mochaTmpdir } from "@usys/utils";
import * as fs from "fs-extra";
import * as path from "path";
import { clitest, expect } from "../../common/fancy";

import { defaultStateHistoryDir } from "../../../src/base";
import {
    domFilename,
    infoFilename,
    stateFilename
} from "../../../src/proj/statehistory";

const localRegistryUrl = localRegistryDefaults.localRegistryUrl;

const basicPackageJson = {
    name: "test",
    version: "1.0.0",
    description: "Adapt project",
    main: "dist/index.js",
    scripts: {},
    author: "",
    license: "UNLICENSED",
    dependencies: {
        "@types/node": "^8.10",
        "@usys/adapt": "0.0.1",
        "source-map-support": "^0.5.6",
        "typescript": "^2.8.3",
    },
};

const simplePluginTs = `
import { Action, Plugin, PluginOptions, registerPlugin } from "@usys/adapt";

class EchoPlugin implements Plugin<{}> {
    _log?: PluginOptions["log"];

    log(...args: any[]) {
        if (this._log == null) throw new Error("Plugin has no log function");
        this._log(this.constructor.name + ":", ...args);
    }

    async start(options: PluginOptions) {
        if (options.log == null) throw new Error("Plugin start called without log");
        this._log = options.log;
        this.log("start");
    }
    async observe(_oldDom: any, dom: any) {
        this.log("observe", dom);
        return {};
    }
    analyze(_oldDom: any, dom: any, _obs: {}): Action[] {
        this.log("analyze", dom);
        return [
            { description: "echo action1", act: () => this.doAction("action1") },
            { description: "echo action2", act: () => this.doAction("action2") }
        ];
    }
    async finish() {
        this.log("finish");
    }

    async doAction(msg: string) {
        this.log(msg);
    }
}

export function create() {
    return new EchoPlugin();
}

registerPlugin({
    module,
    create,
});
`;

const simplePluginPackageJson = `
{
    "name": "echo_plugin",
    "version": "1.0.0",
    "description": "",
    "main": "index.js",
    "scripts": { },
    "author": ""
}
`;

function fakeWindowSize() {
    return [80, 40];
}

async function createProject(pkgJson: any, tsFile: string,
                             tsFilename: string): Promise<void> {
    await fs.writeJson("package.json", pkgJson, {spaces: 2});
    await fs.outputFile(tsFilename, tsFile);
    await fs.outputFile(path.join("simple_plugin", "package.json"), simplePluginPackageJson);
    await fs.outputFile(path.join("simple_plugin", "index.ts"), simplePluginTs);
}

const testCommonNoEnv =
    clitest
    .stdout()
    .stderr();

const testCommon =
    testCommonNoEnv
    .delayedenv(() => {
        return {
            ADAPT_NPM_REGISTRY: localRegistryUrl,
            ADAPT_SERVER_URL: filePathToUrl("db.json"),
        };
    });

const testBase =
    testCommon
    .stub(process.stdout, "isTTY", false); // Turn off progress, etc

const testBaseTty =
    testCommon
    .stub(process.stdout, "isTTY", true) // Ensure TTY-flavored output on stdout
    .stub(process.stdout, "getWindowSize", fakeWindowSize);

/*
 * Basic tests
 */

const basicIndexTsx = `
    import Adapt, { PrimitiveComponent } from "@usys/adapt";
    import "./simple_plugin";

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
  <Root key="Root" xmlns="urn:Adapt:test:1.0.0:$adaptExports:../index.tsx:Root"/>
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

function checkPluginStdout(stdout: string, dryRun = false) {
    const msgs: {[key: string]: boolean} = {
        start: true,
        observe: true,
        analyze: true,
        finish: true,
        action1: !dryRun,
        action2: !dryRun,
    };

    for (const m of Object.keys(msgs)) {
        const line = `EchoPlugin: ${m}`;
        if (msgs[m]) expect(stdout).to.contain(line);
        else expect(stdout).to.not.contain(line);
    }
}

describe("Deploy create basic tests", function() {
    this.timeout(30000);
    mochaTmpdir.each("adapt-cli-test-deploy");

    basicTestChain
    .command(["deploy:create", "--init", "dev"])

    .it("Should build basic default filename", async (ctx) => {
        expect(ctx.stderr).equals("");
        expect(ctx.stdout).contains("Opening state history [completed]");
        expect(ctx.stdout).contains("Validating project [completed]");
        expect(ctx.stdout).contains("Creating new project deployment [completed]");

        checkPluginStdout(ctx.stdout);

        await checkBasicIndexTsxState(defaultStateHistoryDir);
    });

    testBaseTty
    .do(async () => {
        await createProject(basicPackageJson, basicIndexTsx, "index.tsx");
    })
    .command(["deploy:create", "--init", "dev"])

    .it("Should build basic with TTY output", async (ctx) => {
        expect(ctx.stderr).equals("");
        expect(ctx.stdout).contains("✔ Opening state history");
        expect(ctx.stdout).contains("✔ Validating project");
        expect(ctx.stdout).contains("✔ Creating new project deployment");

        checkPluginStdout(ctx.stdout);

        await checkBasicIndexTsxState(defaultStateHistoryDir);
    });

    basicTestChain
    .command(["deploy:create", "--init", "--dryRun", "dev"])

    .it("Should not modify anything with --dryRun", async (ctx) => {
        expect(ctx.stderr).equals("");
        expect(ctx.stdout).contains("Opening state history [completed]");
        expect(ctx.stdout).contains("Validating project [completed]");
        expect(ctx.stdout).contains("Creating new project deployment [completed]");

        checkPluginStdout(ctx.stdout, true);

        await checkBasicIndexTsxState(defaultStateHistoryDir);
    });
});

/*
 * State update tests
 */

function stateUpdateIndexTsx(initialStateStr: string, newStateStr: string) {
    return `
    import Adapt, { AnyState, Component, PrimitiveComponent } from "@usys/adapt";
    import "./simple_plugin";

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
  <Empty id="1" xmlns="urn:Adapt:test:1.0.0:$adaptExports:../index.tsx:Empty">
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

const newDeployRegex = /Deployment created successfully. DeployID is: (.*)$/m;

describe("Deploy update basic tests", () => {
    let deployID = "NOTFOUND";

    // These tests must all use a single temp directory where the
    // state_history can be shared and built upon
    mochaTmpdir.all("adapt-cli-test-deploy");

    stateIncrementTestChain
    .command(["deploy:create", "--init", "dev"])

    .it("Should create initial state", async (ctx) => {
        expect(ctx.stderr).equals("");
        expect(ctx.stdout).contains("Opening state history [completed]");
        expect(ctx.stdout).contains("Validating project [completed]");
        expect(ctx.stdout).contains("Creating new project deployment [completed]");
        expect(ctx.stdout).contains(`Deployment created successfully. DeployID is:`);

        const matches = ctx.stdout.match(newDeployRegex);
        expect(matches).to.be.an("array").with.length(2);
        if (matches && matches[1]) deployID = matches[1];

        checkPluginStdout(ctx.stdout);

        await checkStateUpdateState(defaultStateHistoryDir, 1);
    });

    stateIncrementTestChain
    .delayedcommand(() => ["deploy:update", deployID, "dev"])

    .it("Should create second state", async (ctx) => {
        expect(ctx.stderr).equals("");
        expect(ctx.stdout).contains("Opening state history [completed]");
        expect(ctx.stdout).contains("Validating project [completed]");
        expect(ctx.stdout).contains("Updating project deployment [completed]");
        expect(ctx.stdout).contains(`Deployment ${deployID} updated successfully`);

        checkPluginStdout(ctx.stdout);

        await checkStateUpdateState(defaultStateHistoryDir, 2);
    });

    stateIncrementTestChain
    .delayedcommand(() => ["deploy:update", deployID, "dev"])

    .it("Should create third state", async (ctx) => {
        expect(ctx.stderr).equals("");
        expect(ctx.stdout).contains("Opening state history [completed]");
        expect(ctx.stdout).contains("Validating project [completed]");
        expect(ctx.stdout).contains("Updating project deployment [completed]");
        expect(ctx.stdout).contains(`Deployment ${deployID} updated successfully`);

        checkPluginStdout(ctx.stdout);

        await checkStateUpdateState(defaultStateHistoryDir, 3);
    });
});

describe("Build negative tests", () => {
    mochaTmpdir.each("adapt-cli-test-deploy");

    testBase
    .command(["deploy:create", "--rootFile", "doesntexist", "dev"])
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
    .command(["deploy:create", "--rootFile", "test.ts", "--init", "dev"])
    .catch((err: any) => {
        expect(err.oclif).is.an("object");
        expect(err.oclif.exit).equals(2);
        expect(err.message).contains(
            `The directory '${process.cwd()}' does not contain a package.json file`);
    })
    .it("Should fail if package.json doesn't exist", async (ctx) => {
        expect(ctx.stderr).equals("");
        expect(ctx.stdout).contains("Opening state history [completed]");
        expect(ctx.stdout).contains("This project cannot be deployed");
        expect(ctx.stdout).contains(
            `The directory '${process.cwd()}' does not contain a package.json file`);
        expect(await fs.pathExists(defaultStateHistoryDir)).to.be.false;
    });

    basicTestChain
    .command(["deploy:create", "--init", "dev"])
    .command(["deploy:update", "abc123", "dev"])
    .catch((err: any) => {
        expect(err.message).contains(
            "Deployment 'abc123' does not exist");
    })
    .it("Should fail if deployment doesn't exist");
});
