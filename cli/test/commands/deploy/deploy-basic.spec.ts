import { mochaTmpdir, repoVersions  } from "@usys/testutils";
import { filePathToUrl, yarn } from "@usys/utils";
import * as fs from "fs-extra";
import { cloneDeep, last } from "lodash";
import * as path from "path";
import { clitest, expect } from "../../common/fancy";
import { cliLocalRegistry } from "../../common/start-local-registry";
import { destroyAll, getNewDeployID } from "../../common/testlib";

const domFilename = "adapt_dom.xml";
const observationsFilename = "adapt_observations.json";
const stateFilename = "adapt_state.json";
const infoFilename = "adapt_deploy.json";
const dataDirFilename = "dataDir";

const basicPackageJson = {
    name: "test",
    version: "1.0.0",
    description: "Adapt project",
    main: "index.tsx",
    scripts: {},
    author: "",
    license: "UNLICENSED",
    dependencies: {
        "@types/node": "^8.10",
        "@usys/adapt": repoVersions.adapt,
        "source-map-support": "^0.5.6",
        "typescript": "^3.0.3",
    },
};

const simplePluginTs = `
import {
    Action,
    ActionChange,
    BuiltDomElement,
    ChangeType,
    Plugin,
    PluginOptions,
    registerPlugin
} from "@usys/adapt";

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
        if (oldDom == null && dom == null) return [];

        const diff = domDiff(oldDom, dom);
        const makeChanges = (key: keyof DomDiff, type: ChangeType, detail: string): ActionChange[] =>
            [...diff[key]].map((element) => ({
                type,
                element: element as BuiltDomElement,
                detail
            }]
        });

        if (dom != null && dom.componentType.name === "AnalyzeError") {
            throw new Error("AnalyzeError");
        }
        if (dom != null && dom.componentType.name === "ActError") {
            return [
                { ...info("echo error"), act: () => { throw new Error("ActError"); } },
            ];
        }
        return [
            { ...info("echo action1"), act: () => this.doAction("action1") },
            { ...info("echo action2"), act: () => this.doAction("action2") }
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
    name: "echo",
    module,
    create,
});
`;

const simplePluginPackageJson = `
{
    "name": "echo_plugin",
    "version": "1.0.0",
    "description": "",
    "main": "index.tsx",
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

// This is a function in order to capture cwd at usage time
const commonEnv = () => ({
    ADAPT_NPM_REGISTRY: cliLocalRegistry.yarnProxyOpts.registry,
    ADAPT_SERVER_URL: filePathToUrl(process.cwd()),
});

const testCommon =
    testCommonNoEnv
    .delayedenv(commonEnv);

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

    export class DevStack extends PrimitiveComponent<{}> { }
    export class ActError extends PrimitiveComponent<{}> {}
    export class AnalyzeError extends PrimitiveComponent<{}> {}

    Adapt.stack("dev", <DevStack />);
    Adapt.stack("ActError", <ActError />);
    Adapt.stack("AnalyzeError", <AnalyzeError />);
`;

function observerIndexTsx(id1: number, id2: number) {
    return `
        import Adapt, { gql, Observer, PrimitiveComponent } from "@usys/adapt";
        import MockObserver from "@usys/adapt/dist/src/observers/MockObserver";
        import "./simple_plugin";

        export class DevStack extends PrimitiveComponent<{}> { }

        const app = <Observer
            observer={MockObserver}
            query={gql\`query { mockById(id: "${id1}") { idSquared } }\`}
            build={(err, props) => {
                console.log("+++", err, props, "+++");
                return <DevStack key="DevStack" />;
            }}/>;

        const app2 = <Observer
            observer={MockObserver}
            query={gql\`query { mockById(id: "${id2}") { idSquared } }\`}
            build={(err, props) => {
                console.log("***", err, props, "***");
                return props ? app : <DevStack key="DevStack" />;
            }}/>;

        Adapt.stack("dev", app);
        Adapt.stack("devNeedsData", app2);
    `;
}

// Expects only 1 active deployment
async function findDeploymentDir(): Promise<string> {
    const deploymentList = await fs.readdir("deployments");
    expect(deploymentList).to.be.length(1);
    return path.resolve("deployments", deploymentList[0]);
}

async function findHistoryDir(): Promise<string> {
    const deploymentDir = await findDeploymentDir();
    const historyDirs = (await fs.readdir(deploymentDir)).filter((d) => !/preAct/.test(d));
    expect(historyDirs.length).to.be.greaterThan(0);
    return path.join(deploymentDir, last(historyDirs)!);
}

async function checkBasicIndexTsxState(
    fileName: string,
    projectRoot: string,
    stackName: string,
    namespaces: { [stackName: string]: string[] },
    compName?: string,
    status = "success"
): Promise<void> {

    if (!compName) compName = stackName;
    const historyDir = await findHistoryDir();
    const fileList = await fs.readdir(historyDir);
    expect(fileList).eqls([
        infoFilename,
        domFilename,
        observationsFilename,
        stateFilename,
        dataDirFilename,
    ]);
    const domXml = await fs.readFile(path.join(historyDir, domFilename));
    expect(domXml.toString()).equals(
`<Adapt>
  <${compName} xmlns="urn:Adapt:test:1.0.0::index.tsx:${compName}">
    <__props__>
      <prop name="key">"${compName}"</prop>
    </__props__>
    <__lifecycle__>
      <field name="stateNamespace">${JSON.stringify(namespaces[stackName])}</field>
      <field name="keyPath">["${compName}"]</field>
      <field name="path">"/${compName}"</field>
    </__lifecycle__>
  </${compName}>
</Adapt>
`);
    const state = await fs.readJson(path.join(historyDir, stateFilename));
    expect(state).eqls({});

    const info = await fs.readJson(path.join(historyDir, infoFilename));
    expect(info).eqls({
        fileName,
        projectRoot,
        stackName,
        status,
        dataDir: path.join(historyDir, dataDirFilename),
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

describe("Deploy list tests", function () {
    this.slow(30 * 1000);
    this.timeout(3 * 60 * 1000);
    mochaTmpdir.each("adapt-cli-test-deploy");

    basicTestChain
    .command(["deploy:create", "dev"])
    .command(["deploy:list"])

    .it("Should list deployments", async (ctx) => {
        expect(ctx.stderr).equals("");
        expect(ctx.stdout).contains("Validating project [completed]");
        expect(ctx.stdout).contains("Creating new project deployment [completed]");
        expect(ctx.stdout).matches(/Listing Deployments \[completed\]\n\ntest::dev-[a-z]{4}\n/);
        expect(ctx.stdout).not.contains("using internal adapt module");
    });

    basicTestChain
    .command(["deploy:create", "dev"])
    .do(() => process.chdir("/"))
    .command(["deploy:list"])
    .it("Should list deployments from non-project", async (ctx) => {
        expect(ctx.stderr).equals("");
        expect(ctx.stdout).contains("Validating project [completed]");
        expect(ctx.stdout).contains("Creating new project deployment [completed]");
        expect(ctx.stdout).contains("Listing Deployments [completed]");
        expect(ctx.stdout).matches(/Listing Deployments \[completed\]\n\ntest::dev-[a-z]{4}\n/);
        expect(ctx.stdout).contains("using internal adapt module");
    });

});

describe("Deploy destroy tests", function () {
    this.slow(30 * 1000);
    this.timeout(3 * 60 * 1000);
    let deployID: string;
    mochaTmpdir.each("adapt-cli-test-deploy");

    basicTestChain
    .command(["deploy:create", "dev"])
    .do((ctx) => {
        expect(ctx.stderr).equals("");
        expect(ctx.stdout).contains("Validating project [completed]");
        expect(ctx.stdout).contains("Creating new project deployment [completed]");
        deployID = getNewDeployID(ctx.stdout);
    })
    .delayedcommand(() => ["deploy:destroy", deployID!])
    .command(["deploy:list"])

    .it("Should stop and destroy created deployment", async (ctx) => {
        expect(ctx.stdout).contains("Stopping project deployment [completed]");
        expect(ctx.stdout).contains("Listing Deployments [completed]");
        expect(ctx.stdout).does.not.contain("Listing Deployments [completed]\n\ntest::dev-");
    });
});

describe("Deploy create tests - fresh install", function () {
    this.slow(30 * 1000);
    this.timeout(3 * 60 * 1000);
    mochaTmpdir.each("adapt-cli-test-deploy");

    const namespaces = {
        dev: ["DevStack"],
        ActError: ["ActError"],
        AnalyzeError: ["AnalyzeError"],
    };

    basicTestChain
    .command(["deploy:create", "dev"])

    .it("Should build basic default filename", async (ctx) => {
        expect(ctx.stderr).equals("");
        expect(ctx.stdout).contains("Validating project [completed]");
        expect(ctx.stdout).contains("Creating new project deployment [completed]");

        // Should not have debug=build output
        expect(ctx.stdout).does.not.contain("BUILD [start]");

        checkPluginStdout(ctx.stdout);

        await checkBasicIndexTsxState(
            path.join(process.cwd(), "index.tsx"),
            process.cwd(),
            "dev",
            namespaces,
            "DevStack"
        );

    });

    basicTestChain
    .command(["deploy:create", "AnalyzeError"])
    .catch((err) => {
        // Check for error that includes backtrace and source mapping
        const msgRe = RegExp(
`^This project cannot be deployed.
1 error encountered during deploy:
\\[deploy:create\\] : Error creating deployment: Error: AnalyzeError
.*simple_plugin/index.ts:(.|\n)*
Deployment not created due to errors$`);
// .*simple_plugin/index.ts:.*
        expect(err.message).matches(msgRe);
        expect((err as any).oclif.exit).equals(2);
    })

    .it("Should error before act and not create deployment", async (ctx) => {
        const stdout = ctx.stdout;
        expect(stdout).contains("Validating project [completed]");
        expect(stdout).contains("Analyzing environment [started]");
        expect(stdout).contains("Analyzing environment [failed]");
        expect(stdout).contains("Creating new project deployment [failed]");

        expect(ctx.stderr).contains(`[deploy:create] ERROR: Error creating deployment: Error: AnalyzeError\n`);
        expect(ctx.stderr).contains(`/simple_plugin/index.ts:`);

        const deploymentList = await fs.readdir("deployments");
        expect(deploymentList).to.be.length(0);
    });

    basicTestChain
    .command(["deploy:create", "ActError"])
    .catch((err) => {
        const msgRe = RegExp(
`^This project cannot be deployed.
2 errors encountered during deploy:
\\[deploy:create:deploy:act\\] : --Error while echo error
Error: ActError
----------
\\[deploy:create\\] : Error creating deployment: Errors encountered during plugin action phase

Deployment created but errors occurred in the deploy phase.
DeployID is: test::ActError-[a-z]{4}$`);
        expect(err.message).matches(msgRe);
        expect((err as any).oclif.exit).equals(2);
    })

    .it("Should error in act and create deployment", async (ctx) => {
        const stdout = ctx.stdout;
        expect(stdout).contains("Validating project [completed]");
        expect(stdout).contains("Applying changes to environment [started]");
        expect(stdout).contains("Applying changes to environment [failed]");
        expect(stdout).contains("Creating new project deployment [failed]");

        expect(ctx.stderr).contains("ERROR: --Error while echo error\nError: ActError");

        await checkBasicIndexTsxState(
            path.join(process.cwd(), "index.tsx"),
            process.cwd(),
            "ActError",
            namespaces,
            "ActError",
            "failed"
        );
    });
});

describe("Deploy create basic tests", function () {
    this.slow(30 * 1000);
    this.timeout(3 * 60 * 1000);

    mochaTmpdir.all("adapt-cli-test-deploy");

    afterEach(async function destroyDeployment() {
        this.timeout(10 * 1000);
        await destroyAll({ env: commonEnv() });
    });

    const namespaces = {
        dev: ["DevStack"],
        ActError: ["ActError"],
        AnalyzeError: ["AnalyzeError"],
    };

    async function updateTSVersion(version: string) {
        const pkgJ = cloneDeep(basicPackageJson);
        pkgJ.dependencies.typescript = version;

        await fs.writeJson("package.json", pkgJ, {spaces: 2});
    }

    testBaseTty
    .do(async () => {
        await createProject(basicPackageJson, basicIndexTsx, "index.tsx");
    })
    .command(["deploy:create", "dev"])

    .it("Should build basic with TTY output", async (ctx) => {
        expect(ctx.stderr).equals("");
        expect(ctx.stdout).contains("✔ Validating project");
        expect(ctx.stdout).contains("✔ Creating new project deployment");
        expect(ctx.stdout).contains("Deployment created successfully. DeployID is:");

        await checkBasicIndexTsxState(
            path.join(process.cwd(), "index.tsx"),
            process.cwd(),
            "dev",
            namespaces,
            "DevStack"
        );
    });

    testBaseTty
    .do(async () => {
        await createProject(basicPackageJson, basicIndexTsx, "index.tsx");
    })
    .command(["deploy:create", "-q", "dev"])

    .it("Should build quietly", async (ctx) => {
        expect(ctx.stderr).equals("");
        expect(ctx.stdout).matches(/^Deployment created successfully. DeployID is: test::dev-[a-z]{4}\n$/m);

        await checkBasicIndexTsxState(
            path.join(process.cwd(), "index.tsx"),
            process.cwd(),
            "dev",
            namespaces,
            "DevStack"
        );
    });

    testBaseTty
    .do(async () => {
        await createProject(basicPackageJson, basicIndexTsx, "index.tsx");
    })
    .command(["deploy:create", "--debug=build", "dev"])

    .it("Should not use update renderer with --debug", async (ctx) => {
        expect(ctx.stderr).equals("");
        expect(ctx.stdout).does.not.contain("✔ Validating project");
        expect(ctx.stdout).contains("Validating project [completed]");
        expect(ctx.stdout).contains("Creating new project deployment [completed]");
        expect(ctx.stdout).contains("Deployment created successfully. DeployID is:");

        checkPluginStdout(ctx.stdout);

        // Should have debug=build output
        expect(ctx.stdout).contains("BUILD [start]");
        expect(ctx.stdout).contains("BUILD [done]");

        await checkBasicIndexTsxState(
            path.join(process.cwd(), "index.tsx"),
            process.cwd(),
            "dev",
            namespaces,
            "DevStack"
        );
    });

    basicTestChain
    .command(["deploy:create", "--dryRun", "dev"])

    .it("Should not modify anything with --dryRun", async (ctx) => {
        expect(ctx.stderr).equals("");
        expect(ctx.stdout).contains("Validating project [completed]");
        expect(ctx.stdout).contains("Creating new project deployment [completed]");

        checkPluginStdout(ctx.stdout, true);

        const deploymentList = await fs.readdir("deployments");
        expect(deploymentList).length(0);
    });

    basicTestChain
    .command(["deploy:create", "--debug=build", "dev"])

    .it("Should show build recorder output with --debug=build", async (ctx) => {
        expect(ctx.stderr).equals("");
        expect(ctx.stdout).contains("Validating project [completed]");
        expect(ctx.stdout).contains("Creating new project deployment [completed]");

        checkPluginStdout(ctx.stdout);

        // Should have debug=build output
        expect(ctx.stdout).contains("BUILD [start]");
        expect(ctx.stdout).contains("BUILD [done]");

        await checkBasicIndexTsxState(
            path.join(process.cwd(), "index.tsx"),
            process.cwd(),
            "dev",
            namespaces,
            "DevStack"
        );
    });

    basicTestChain
    .do(async () => {
        await updateTSVersion("3.0.3");
    })
    .command(["deploy:create", "dev"])

    .it("Should deploy with TS 3.0.3", async (ctx) => {
        // Make sure the right TS was installed
        const modList = await yarn.listParsed({ depth: 0 });
        const tsMod = modList.get("typescript");
        if (tsMod == null) throw expect(tsMod).is.not.undefined;
        expect(tsMod.name).equals("typescript");
        expect(Object.keys(tsMod.versions)).eql(["3.0.3"]);

        expect(ctx.stderr).equals("");
        expect(ctx.stdout).contains("Validating project [completed]");
        expect(ctx.stdout).contains("Creating new project deployment [completed]");

        // Should not have debug=build output
        expect(ctx.stdout).does.not.contain("BUILD [start]");

        checkPluginStdout(ctx.stdout);

        await checkBasicIndexTsxState(
            path.join(process.cwd(), "index.tsx"),
            process.cwd(),
            "dev",
            namespaces,
            "DevStack"
        );
    });

    basicTestChain
    .do(async () => {
        await updateTSVersion("3.3.3");
    })
    .command(["deploy:create", "dev"])

    .it("Should deploy with TS 3.3.3", async (ctx) => {
        // Make sure the right TS was installed
        const modList = await yarn.listParsed({ depth: 0 });
        const tsMod = modList.get("typescript");
        if (tsMod == null) throw expect(tsMod).is.not.undefined;
        expect(tsMod.name).equals("typescript");
        expect(Object.keys(tsMod.versions)).eql(["3.3.3"]);

        expect(ctx.stderr).equals("");
        expect(ctx.stdout).contains("Validating project [completed]");
        expect(ctx.stdout).contains("Creating new project deployment [completed]");

        // Should not have debug=build output
        expect(ctx.stdout).does.not.contain("BUILD [start]");

        checkPluginStdout(ctx.stdout);

        await checkBasicIndexTsxState(
            path.join(process.cwd(), "index.tsx"),
            process.cwd(),
            "dev",
            namespaces,
            "DevStack"
        );
    });
});

const observerTest = testBase
    .do(async () => {
        await createProject(basicPackageJson, observerIndexTsx(5, 6), "index.tsx");
    });

describe("Observer Needs Data Reporting", function () {
    this.slow(20 * 1000);
    this.timeout(50 * 1000);
    mochaTmpdir.each("adapt-cli-test-deploy");

    const namespaces = {
        dev: ["Observer", "DevStack"],
        devNeedsData: ["Observer", "Observer-Observer", "DevStack"],
    };

    observerTest
    .command(["deploy:create", "dev"])
    .it("Should deploy and not have any observers that need data", async (ctx) => {
        expect(ctx.stderr).equals("");
        expect(ctx.stdout).contains("Validating project [completed]");
        expect(ctx.stdout).contains("Creating new project deployment [completed]");
        expect(ctx.stdout).not.contains("still needs data");
        checkPluginStdout(ctx.stdout);

        await checkBasicIndexTsxState(
            path.join(process.cwd(), "index.tsx"),
            process.cwd(),
            "dev",
            namespaces,
            "DevStack"
        );
    });

    observerTest
    .command(["deploy:create", "devNeedsData"])
    .it("Should deploy and report that observers need data", async (ctx) => {
        expect(ctx.stderr).equals("");
        expect(ctx.stdout).contains("Validating project [completed]");
        expect(ctx.stdout).contains("Creating new project deployment [completed]");
        expect(ctx.stdout).contains("Observer 'MockObserver' still needs data");

        checkPluginStdout(ctx.stdout);

        await checkBasicIndexTsxState(
            path.join(process.cwd(), "index.tsx"),
            process.cwd(),
            "devNeedsData",
            namespaces,
            "DevStack"
        );
    });

    function observerUpdateTest(shouldNeed: boolean) {
        let deployID = "NOTFOUND";
        const newStack = shouldNeed ? "devNeedsData" : "dev";
        return observerTest
        .command(["deploy:create", "dev"])
        .do(async (ctx) => {
            expect(ctx.stderr).equals("");
            expect(ctx.stdout).contains("Validating project [completed]");
            expect(ctx.stdout).contains("Creating new project deployment [completed]");
            expect(ctx.stdout).not.contains("still needs data");

            checkPluginStdout(ctx.stdout);

            await checkBasicIndexTsxState(
                path.join(process.cwd(), "index.tsx"),
                process.cwd(),
                "dev",
                namespaces,
                "DevStack"
            );

            const matches = ctx.stdout.match(newDeployRegex);
            expect(matches).to.be.an("array").with.length(2);
            if (matches && matches[1]) deployID = matches[1];
        })
        .do(async () => {
            await fs.outputFile("index.tsx", observerIndexTsx(7, 8));
        })
        .delayedcommand(() => ["deploy:update", deployID, newStack])
        .it(`Should update and report that observers ${shouldNeed ? "need" : "do not need"} data`, async (ctx) => {
            expect(ctx.stderr).equals("");
            expect(ctx.stdout).contains("Validating project [completed]");
            expect(ctx.stdout).contains("Creating new project deployment [completed]");
            if (shouldNeed) expect(ctx.stdout).contains("Observer 'MockObserver' still needs data");

            checkPluginStdout(ctx.stdout);

            await checkBasicIndexTsxState(
                path.join(process.cwd(), "index.tsx"),
                process.cwd(),
                newStack,
                namespaces,
                "DevStack"
            );
        });
    }

    observerUpdateTest(true);
    observerUpdateTest(false);
});

/*
 * State update tests
 */

function stateUpdateIndexTsx(initialStateStr: string, newStateStr: string) {
    return `
    import Adapt, { AnyState, Component, PrimitiveComponent } from "@usys/adapt";
    import "./simple_plugin";

    export class Empty extends PrimitiveComponent<{ id: number }> { }

    interface StateUpdaterProps {
        newState: (prev: any, props: StateUpdaterProps) => any;
        initialState: any;
    }

    export class StateUpdater extends Component<StateUpdaterProps, AnyState> {
        initialState() {
            return this.props.initialState;
        }

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

async function checkStateUpdateState(count: number): Promise<void> {
    const deploymentDir = await findDeploymentDir();
    const historyList = await fs.readdir(deploymentDir);
    expect(historyList.length).equals(count * 2);

    historyList.sort();
    let deployNum = 0;

    for (const dirName of historyList) {
        const matches = dirName.match(/^(\d{5})-([^-]+)/);
        expect(matches).to.be.an("array").with.lengthOf(3);
        if (matches == null) throw expect(matches).is.not.null;
        expect(parseInt(matches[1], 10)).to.equal(deployNum);

        const dir = path.join(deploymentDir, dirName);

        const domXml = await fs.readFile(path.join(dir, domFilename));
        expect(domXml.toString()).equals(
`<Adapt>
  <Empty id="1" xmlns="urn:Adapt:test:1.0.0::index.tsx:Empty">
    <__props__>
      <prop name="key">"StateUpdater-Empty"</prop>
    </__props__>
    <__lifecycle__>
      <field name="stateNamespace">["StateUpdater","StateUpdater-Empty"]</field>
      <field name="keyPath">["StateUpdater-Empty"]</field>
      <field name="path">"/Empty"</field>
    </__lifecycle__>
  </Empty>
</Adapt>
`);
        const state = await fs.readJson(path.join(dir, stateFilename));
        expect(state).eqls({
            '["StateUpdater"]': { count: deployNum + 1 }
        });
        if (matches[2] === "success" || matches[2] === "failed") deployNum++;
    }
}

const stateIncrementTestChain =
    testBase
    .do(async () => {
        const indexTsx = stateUpdateIndexTsx("{count: 1}", "(_prev, _props) => ({ count: 1 })");
        await createProject(basicPackageJson, indexTsx, "index.tsx");
    });

const newDeployRegex = /Deployment created successfully. DeployID is: (.*)$/m;

describe("Deploy update basic tests", function () {
    this.slow(5 * 1000);
    this.timeout(10 * 1000);
    let deployID = "NOTFOUND";

    // These tests must all use a single temp directory where the
    // state_history can be shared and built upon
    mochaTmpdir.all("adapt-cli-test-deploy");

    stateIncrementTestChain
    .timeout(20 * 1000)
    .do(async () => fs.outputFile("index.tsx",
        stateUpdateIndexTsx("{count: 1}", "(_prev, _props) => ({ count: 1 })")))
    .command(["deploy:create", "dev"])

    .it("Should create initial state", async (ctx) => {
        expect(ctx.stderr).equals("");
        expect(ctx.stdout).contains("Validating project [completed]");
        expect(ctx.stdout).contains("Creating new project deployment [completed]");
        expect(ctx.stdout).contains(`Deployment created successfully. DeployID is:`);

        const matches = ctx.stdout.match(newDeployRegex);
        expect(matches).to.be.an("array").with.length(2);
        if (matches && matches[1]) deployID = matches[1];

        checkPluginStdout(ctx.stdout);

        await checkStateUpdateState(1);
    });

    stateIncrementTestChain
    .do(async () => fs.outputFile("index.tsx",
        stateUpdateIndexTsx("{count: 1}", "(_prev, _props) => ({ count: 2 })")))
    .delayedcommand(() => ["deploy:update", deployID, "dev"])

    .it("Should create second state", async (ctx) => {
        expect(ctx.stderr).equals("");
        expect(ctx.stdout).contains("Validating project [completed]");
        expect(ctx.stdout).contains("Updating project deployment [completed]");
        expect(ctx.stdout).contains(`Deployment ${deployID} updated successfully`);

        checkPluginStdout(ctx.stdout);

        await checkStateUpdateState(2);
    });

    stateIncrementTestChain
    .do(async () => fs.outputFile("index.tsx",
        stateUpdateIndexTsx("{count: 1}", "(_prev, _props) => ({ count: 3 })")))
    .delayedcommand(() => ["deploy:update", deployID, "dev"])

    .it("Should create third state", async (ctx) => {
        expect(ctx.stderr).equals("");
        expect(ctx.stdout).contains("Validating project [completed]");
        expect(ctx.stdout).contains("Updating project deployment [completed]");
        expect(ctx.stdout).contains(`Deployment ${deployID} updated successfully`);

        checkPluginStdout(ctx.stdout);

        await checkStateUpdateState(3);
    });

    stateIncrementTestChain
    .delayedcommand(() => ["deploy:status", deployID, "dev"])

    .it("Should report status", async (ctx) => {
        expect(ctx.stderr).equals("");
        expect(ctx.stdout).contains(`Deployment ${deployID} status:`);
        expect(ctx.stdout).contains(`{
  "noStatus": "element has no children"
}`);
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
    .command(["deploy:create", "--rootFile", "test.ts", "dev"])
    .catch((err: any) => {
        expect(err.oclif).is.an("object");
        expect(err.oclif.exit).equals(2);
        expect(err.message).contains(
            `The directory '${process.cwd()}' does not contain a package.json file`);
    })
    .it("Should fail if package.json doesn't exist", async (ctx) => {
        expect(ctx.stderr).equals("");
        expect(ctx.stdout).contains("This project cannot be deployed");
        expect(ctx.stdout).contains(
            `The directory '${process.cwd()}' does not contain a package.json file`);
    });

    basicTestChain
    .command(["deploy:create", "dev"])
    .command(["deploy:update", "abc123", "dev"])
    .catch((err: any) => {
        expect(err.message).contains(
            "Deployment 'abc123' does not exist");
    })
    .it("Should fail if deployment doesn't exist");
});
