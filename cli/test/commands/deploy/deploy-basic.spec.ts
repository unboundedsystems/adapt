/*
 * Copyright 2018-2020 Unbounded Systems, LLC
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

import { mochaTmpdir, repoVersions  } from "@adpt/testutils";
import { filePathToUrl, repoRootDir, yarn } from "@adpt/utils";
import execa from "execa";
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
        "@adpt/core": repoVersions.core,
        "source-map-support": "^0.5.6",
        "typescript": "^3.0.3",
    },
};

const simplePluginTs = `
import {
    Action,
    ActionChange,
    FinalDomElement,
    ChangeType,
    domDiff,
    DomDiff,
    Plugin,
    PluginOptions,
    registerPlugin
} from "@adpt/core";

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
    analyze(oldDom: any, dom: any, _obs: {}): Action[] {
        this.log("analyze", dom);
        if (oldDom == null && dom == null) return [];

        const diff = domDiff(oldDom, dom);
        const makeChanges = (key: keyof DomDiff, type: ChangeType, detail: string, n?: number): ActionChange[] => {
            const changes = [...diff[key]].map((element) => ({
                type,
                element: element as FinalDomElement,
                detail
            }));
            if (n !== undefined && changes.length > n) return [ changes[n] ];
            return changes;
        };

        const info = (msg: string, n: number) => {
            const detail = msg + n;
            const changes: ActionChange[] = [];
            changes.push(...makeChanges("added", ChangeType.create, detail, n));
            changes.push(...makeChanges("deleted", ChangeType.delete, detail, n));
            changes.push(...makeChanges("commonNew", ChangeType.modify, detail, n));

            return {
                type: ChangeType.modify,
                detail,
                changes,
            };
        };

        if (dom != null && dom.componentType.name === "AnalyzeError") {
            throw new Error("AnalyzeError");
        }
        if (dom != null && dom.componentType.name === "ActError") {
            return [
                { ...info("echo error", 0), act: () => { throw new Error("ActError"); } },
                { ...info("echo error", 1), act: () => { throw new Error("ActError"); } },
            ];
        }
        return [
            { ...info("echo act", 0), act: () => this.doAction("action0") },
            { ...info("echo act", 1), act: () => this.doAction("action1") }
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
    import Adapt, { AnyProps, Constructor, PrimitiveComponent } from "@adpt/core";
    import "./simple_plugin";

    export class DevStack extends PrimitiveComponent { }
    export class ActError extends PrimitiveComponent {}
    export class AnalyzeError extends PrimitiveComponent<{}> {}

    Adapt.stack("default", makeTwo(DevStack));
    Adapt.stack("dev", makeTwo(DevStack));
    Adapt.stack("ActError", makeTwo(ActError));
    Adapt.stack("AnalyzeError", <AnalyzeError />);

    function makeTwo(Comp: Constructor<PrimitiveComponent<AnyProps>>) {
        const key = Comp.name;
        return <Comp key={key}><Comp key={key} /></Comp>;
    }
`;

function observerIndexTsx(id1: number, id2: number) {
    return `
        import Adapt, { AnyProps, Constructor, gql, Observer, PrimitiveComponent } from "@adpt/core";
        import MockObserver from "@adpt/core/dist/src/observers/MockObserver";
        import "./simple_plugin";

        export class DevStack extends PrimitiveComponent { }

        const app = <Observer
            observer={MockObserver}
            query={gql\`query { mockById(id: "${id1}") { idSquared } }\`}
            build={(err, props) => {
                console.log("+++", err, props, "+++");
                return makeTwo(DevStack);
            }}/>;

        const app2 = <Observer
            observer={MockObserver}
            query={gql\`query { mockById(id: "${id2}") { idSquared } }\`}
            build={(err, props) => {
                console.log("***", err, props, "***");
                return props ? app : makeTwo(DevStack);
            }}/>;

        Adapt.stack("dev", app);
        Adapt.stack("devNeedsData", app2);

        function makeTwo(Comp: Constructor<PrimitiveComponent<AnyProps>>) {
            const key = Comp.name;
            return <Comp key={key}><Comp key={key} /></Comp>;
        }
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
    const ns1 = namespaces[stackName];
    const ns2 = ns1.concat(compName);
    expect(domXml.toString()).equals(
`<Adapt>
  <${compName} xmlns="urn:Adapt:test:1.0.0::index.tsx:${compName}">
    <__props__>
      <prop name="key">"${compName}"</prop>
    </__props__>
    <${compName} xmlns="urn:Adapt:test:1.0.0::index.tsx:${compName}">
      <__props__>
        <prop name="key">"${compName}"</prop>
      </__props__>
      <__lifecycle__>
        <field name="stateNamespace">${JSON.stringify(ns2)}</field>
        <field name="keyPath">["${compName}","${compName}"]</field>
        <field name="path">"/${compName}/${compName}"</field>
      </__lifecycle__>
    </${compName}>
    <__lifecycle__>
      <field name="stateNamespace">${JSON.stringify(ns1)}</field>
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
        action0: !dryRun,
        action1: !dryRun,
    };

    for (const m of Object.keys(msgs)) {
        const line = `EchoPlugin: ${m}`;
        if (msgs[m]) expect(stdout).to.contain(line);
        else expect(stdout).to.not.contain(line);
    }
}

function registryOpts() {
    if (!cliLocalRegistry.yarnProxyOpts.registry) return [];
    return ["--registry", cliLocalRegistry.yarnProxyOpts.registry];
}

/*
 * NOTE: yarn cannot be used here because it ignores the --registry option
 * when used with "yarn global". See https://github.com/yarnpkg/yarn/issues/5056
 */
export async function globalAdd(pkg: string, prefixDir: string) {
    const args = [ "install", ...registryOpts(), "-g", "-C", prefixDir, pkg ];
    const { stdout, stderr } = await execa("npm", args, { all: true });
    if (stderr !== "") {
        const cmd = "npm install " + args.join(" ");
        // tslint:disable-next-line: no-console
        console.log(`Error installing ${pkg} - command: '${cmd}'\n` +
            `STDOUT:\n${stdout}\nSTDERR:\n${stderr}\n`);
        throw new Error(`Warnings in npm install output`);
    }
}

function pathWithoutRepo(prepend?: string) {
    const orig = process.env.PATH;
    if (!orig) throw new Error(`PATH is invalid (${orig})`);
    const paths = orig.split(":").filter((p) => !p.startsWith(repoRootDir));
    if (prepend) paths.unshift(prepend);
    return paths.join(":");
}

/**
 * basicTestChain, but with the environment PATH filtered to remove all
 * paths in the source tree.
 */
const basicNoSrcDirChain = basicTestChain
    .delayedenv(() => {
        const pOrig = process.env.PATH || "";
        const pNew = pOrig.split(":").filter((el) => !el.startsWith("/src/")).join(":");
        return { PATH: pNew };
    });

describe("Global CLI install", function () {
    this.slow(30 * 1000);
    this.timeout(3 * 60 * 1000);
    let tmpDir = "";
    const env: NodeJS.ProcessEnv = {};

    mochaTmpdir.all("adapt-cli-test-global");

    before(async () => {
        tmpDir = process.cwd();
        env.PATH = pathWithoutRepo(path.join(tmpDir, "global", "bin"));

        try {
            await globalAdd("@adpt/cli@unit-tests", path.join(tmpDir, "global"));
        } catch (err) {
            // tslint:disable-next-line: no-console
            if (err.all) console.error(`${err.message}\n${err.all}`);
            throw err;
        }
    });

    basicNoSrcDirChain
    .finally(() => process.chdir(tmpDir))
    .command(["run", "dev"])
    .do(async (ctx) => {
        expect(ctx.stderr).equals("");
        expect(ctx.stdout).contains("Validating project [completed]");
        expect(ctx.stdout).contains("Creating new project deployment [completed]");
        const deployID = getNewDeployID(ctx.stdout);

        process.chdir("/");
        // Call the globally installed adapt
        const ret = await execa("adapt", ["list"], { env });
        expect(ret.stderr).equals("");
        expect(ret.stdout).contains(`Listing Deployments [completed]\n\n${deployID}`);
        expect(ret.stdout).contains("using internal adapt module");
    })
    .it("Should list deployments from non-project with global install");
});

describe("deploy:list tests", function () {
    this.slow(30 * 1000);
    this.timeout(3 * 60 * 1000);
    mochaTmpdir.each("adapt-cli-test-deploy");

    basicTestChain
    .command(["deploy:run", "dev"])
    .command(["deploy:list"])

    .it("Should list deployments", async (ctx) => {
        expect(ctx.stderr).equals("");
        expect(ctx.stdout).contains("Validating project [completed]");
        expect(ctx.stdout).contains("Creating new project deployment [completed]");
        expect(ctx.stdout).matches(/Listing Deployments \[completed\]\n\ntest::dev-[a-z]{4}\n/);
        expect(ctx.stdout).not.contains("using internal adapt module");
    });

    basicTestChain
    .command(["deploy:run", "dev"])
    .command(["list"])

    .it("Should list deployments (with alias)", async (ctx) => {
        expect(ctx.stderr).equals("");
        expect(ctx.stdout).contains("Validating project [completed]");
        expect(ctx.stdout).contains("Creating new project deployment [completed]");
        expect(ctx.stdout).matches(/Listing Deployments \[completed\]\n\ntest::dev-[a-z]{4}\n/);
        expect(ctx.stdout).not.contains("using internal adapt module");
    });

});

describe("deploy:destroy tests", function () {
    this.slow(30 * 1000);
    this.timeout(3 * 60 * 1000);
    let deployID: string;
    mochaTmpdir.each("adapt-cli-test-deploy");

    basicTestChain
    .command(["deploy:run", "dev"])
    .do((ctx) => {
        expect(ctx.stderr).equals("");
        expect(ctx.stdout).contains("Validating project [completed]");
        expect(ctx.stdout).contains("Creating new project deployment [completed]");
        expect(ctx.stdout).does.not.contain("WARNING");
        deployID = getNewDeployID(ctx.stdout);
    })
    .delayedcommand(() => ["deploy:destroy", deployID!])
    .command(["deploy:list"])

    .it("Should stop and destroy created deployment", async (ctx) => {
        expect(ctx.stdout).contains("Stopping project deployment [completed]");
        expect(ctx.stdout).contains("Listing Deployments [completed]");
        expect(ctx.stdout).does.not.contain("Listing Deployments [completed]\n\ntest::dev-");
        expect(ctx.stdout).does.not.contain("WARNING");
    });

    basicTestChain
    .command(["run", "dev"])
    .do((ctx) => {
        expect(ctx.stderr).equals("");
        expect(ctx.stdout).contains("Validating project [completed]");
        expect(ctx.stdout).contains("Creating new project deployment [completed]");
        expect(ctx.stdout).does.not.contain("WARNING");
        deployID = getNewDeployID(ctx.stdout);
    })
    .delayedcommand(() => ["destroy", deployID!])
    .command(["list"])

    .it("Should stop and destroy created deployment (with aliases)", async (ctx) => {
        expect(ctx.stdout).contains("Stopping project deployment [completed]");
        expect(ctx.stdout).contains("Listing Deployments [completed]");
        expect(ctx.stdout).does.not.contain("Listing Deployments [completed]\n\ntest::dev-");
        expect(ctx.stdout).does.not.contain("WARNING");
    });
});

describe("deploy:run tests - fresh install", function () {
    this.slow(30 * 1000);
    this.timeout(3 * 60 * 1000);
    mochaTmpdir.each("adapt-cli-test-deploy");

    const namespaces = {
        dev: ["DevStack"],
        ActError: ["ActError"],
        AnalyzeError: ["AnalyzeError"],
    };

    basicTestChain
    .command(["deploy:run", "dev"])

    .it("Should build basic default filename", async (ctx) => {
        expect(ctx.stderr).equals("");
        expect(ctx.stdout).contains("Validating project [completed]");
        expect(ctx.stdout).contains("Creating new project deployment [completed]");
        expect(ctx.stdout).does.not.contain("WARNING");

        // Should not have debug=build output
        expect(ctx.stdout).does.not.contain("BUILD 1 [start]");

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
    .command(["deploy:run", "AnalyzeError"])
    .catch((err) => {
        // Check for error that includes backtrace and source mapping
        const msgRe = RegExp(
`^This project cannot be deployed.
1 error encountered during deploy:
\\[deploy:run\\] : Error creating deployment: Error: AnalyzeError
.*simple_plugin/index.ts:(.|\n)*
Deployment not created due to errors$`);
// .*simple_plugin/index.ts:.*
        expect(err.message).matches(msgRe);
        expect((err as any).oclif.exit).equals(2);
    })

    .it("Should error before act and not create deployment", async (ctx) => {
        const stdout = ctx.stdout;
        expect(stdout).contains("Validating project [completed]");
        expect(stdout).contains("Deploying [started]");
        expect(stdout).contains("Applying changes to environment [started]");
        expect(stdout).contains("Observing and analyzing environment");
        expect(stdout).contains("Applying changes to environment [failed]");
        expect(stdout).contains("Creating new project deployment [failed]");

        expect(ctx.stderr).contains(`[deploy:run] ERROR: Error creating deployment: Error: AnalyzeError\n`);
        expect(ctx.stderr).contains(`/simple_plugin/index.ts:`);

        const deploymentList = await fs.readdir("deployments");
        expect(deploymentList).to.be.length(0);
    });

    basicTestChain
    .command(["deploy:run", "ActError"])
    .catch((err) => {
        const id = getNewDeployID(err.message);
        expect(err.message).equals(
`This project cannot be deployed.
3 errors encountered during deploy:
[deploy:run:deploy:act] : --Error while echo error0
Error: ActError
----------
[deploy:run:deploy:act] : --Error while echo error1
Error: ActError
----------
[deploy:run] : Error creating deployment: Errors encountered during plugin action phase

Deployment created but errors occurred in the deploy phase.
DeployID is: ${id}`);
        expect((err as any).oclif.exit).equals(2);
    })

    .it("Should error in act and create deployment", async (ctx) => {
        const stdout = ctx.stdout;
        expect(stdout).contains("Validating project [completed]");
        expect(stdout).contains("Applying changes to environment [started]");
        expect(stdout).contains("Applying changes to environment [failed]");
        expect(stdout).contains("Creating new project deployment [failed]");

        expect(ctx.stderr).contains("ERROR: --Error while echo error0\nError: ActError");

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

describe("deploy:run basic tests", function () {
    this.slow(30 * 1000);
    this.timeout(3 * 60 * 1000);

    mochaTmpdir.all("adapt-cli-test-deploy");

    afterEach(async function destroyDeployment() {
        this.timeout(60 * 1000);
        await destroyAll({ env: commonEnv() });
    });

    const namespaces = {
        default: ["DevStack"],
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
    .command(["deploy:run", "dev"])

    .it("Should build basic with TTY output", async (ctx) => {
        expect(ctx.stderr).equals("");
        expect(ctx.stdout).contains("✔ Validating project");
        expect(ctx.stdout).contains("✔ Creating new project deployment");
        expect(ctx.stdout).contains("Deployment created successfully. DeployID is:");
        expect(ctx.stdout).does.not.contain("WARNING");

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
    .command(["run", "dev"])

    .it("Should build basic with TTY output (using alias)", async (ctx) => {
        expect(ctx.stderr).equals("");
        expect(ctx.stdout).contains("✔ Validating project");
        expect(ctx.stdout).contains("✔ Creating new project deployment");
        expect(ctx.stdout).contains("Deployment created successfully. DeployID is:");
        expect(ctx.stdout).does.not.contain("WARNING");

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
    .command(["run"])

    .it("Should build basic with TTY output (using default stack)", async (ctx) => {
        expect(ctx.stderr).equals("");
        expect(ctx.stdout).contains("✔ Validating project");
        expect(ctx.stdout).contains("✔ Creating new project deployment");
        expect(ctx.stdout).contains("Deployment created successfully. DeployID is:");
        expect(ctx.stdout).does.not.contain("WARNING");

        await checkBasicIndexTsxState(
            path.join(process.cwd(), "index.tsx"),
            process.cwd(),
            "default",
            namespaces,
            "DevStack"
        );
    });

    testBaseTty
    .do(async () => {
        await createProject(basicPackageJson, basicIndexTsx, "index.tsx");
    })
    .command(["deploy:run", "-q", "dev"])

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
    .command(["deploy:run", "--debug=build", "dev"])

    .it("Should not use update renderer with --debug", async (ctx) => {
        expect(ctx.stderr).equals("");
        expect(ctx.stdout).does.not.contain("✔ Validating project");
        expect(ctx.stdout).contains("Validating project [completed]");
        expect(ctx.stdout).contains("Creating new project deployment [completed]");
        expect(ctx.stdout).contains("Deployment created successfully. DeployID is:");
        expect(ctx.stdout).does.not.contain("WARNING");

        checkPluginStdout(ctx.stdout);

        // Should have debug=build output
        expect(ctx.stdout).contains("BUILD 1 [start]");
        expect(ctx.stdout).contains("BUILD 1 [done]");

        await checkBasicIndexTsxState(
            path.join(process.cwd(), "index.tsx"),
            process.cwd(),
            "dev",
            namespaces,
            "DevStack"
        );
    });

    basicTestChain
    .command(["deploy:run", "--dryRun", "dev"])

    .it("Should not modify anything with --dryRun", async (ctx) => {
        expect(ctx.stderr).equals("");
        expect(ctx.stdout).contains("Validating project [completed]");
        expect(ctx.stdout).contains("Creating new project deployment [completed]");
        expect(ctx.stdout).does.not.contain("WARNING");

        checkPluginStdout(ctx.stdout, true);

        const deploymentList = await fs.readdir("deployments");
        expect(deploymentList).length(0);
    });

    basicTestChain
    .command(["deploy:run", "--debug=build", "dev"])

    .it("Should show build recorder output with --debug=build", async (ctx) => {
        expect(ctx.stderr).equals("");
        expect(ctx.stdout).contains("Validating project [completed]");
        expect(ctx.stdout).contains("Creating new project deployment [completed]");
        expect(ctx.stdout).does.not.contain("WARNING");

        checkPluginStdout(ctx.stdout);

        // Should have debug=build output
        expect(ctx.stdout).contains("BUILD 1 [start]");
        expect(ctx.stdout).contains("BUILD 1 [done]");

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
    .command(["deploy:run", "dev"])

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
        expect(ctx.stdout).does.not.contain("WARNING");

        // Should not have debug=build output
        expect(ctx.stdout).does.not.contain("BUILD 1 [start]");

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
    .command(["deploy:run", "dev"])

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
        expect(ctx.stdout).does.not.contain("BUILD 1 [start]");

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
    .command(["deploy:run", "dev"])
    .it("Should deploy and not have any observers that need data", async (ctx) => {
        expect(ctx.stderr).equals("");
        expect(ctx.stdout).contains("Validating project [completed]");
        expect(ctx.stdout).contains("Creating new project deployment [completed]");
        expect(ctx.stdout).not.contains("still needs data");
        expect(ctx.stdout).does.not.contain("WARNING");
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
    .command(["deploy:run", "devNeedsData"])
    .it("Should deploy and report that observers need data", async (ctx) => {
        expect(ctx.stderr).equals("");
        expect(ctx.stdout).contains("Validating project [completed]");
        expect(ctx.stdout).contains("Creating new project deployment [completed]");
        expect(ctx.stdout).contains("Observer 'MockObserver' still needs data");
        expect(ctx.stdout).does.not.contain("WARNING");

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
        .command(["deploy:run", "dev"])
        .do(async (ctx) => {
            expect(ctx.stderr).equals("");
            expect(ctx.stdout).contains("Validating project [completed]");
            expect(ctx.stdout).contains("Creating new project deployment [completed]");
            expect(ctx.stdout).not.contains("still needs data");
            expect(ctx.stdout).does.not.contain("WARNING");

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
            expect(ctx.stdout).does.not.contain("WARNING");

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
    import Adapt, { AnyState, Component, PrimitiveComponent } from "@adpt/core";
    import "./simple_plugin";

    export class Empty extends PrimitiveComponent<{ id: number; children?: any }> { }

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
            return <Empty id={1}><Empty id={2} /></Empty>;
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
    <Empty id="2" key="Empty" xmlns="urn:Adapt:test:1.0.0::index.tsx:Empty">
      <__lifecycle__>
        <field name="stateNamespace">["StateUpdater","StateUpdater-Empty","Empty"]</field>
        <field name="keyPath">["StateUpdater-Empty","Empty"]</field>
        <field name="path">"/Empty/Empty"</field>
      </__lifecycle__>
    </Empty>
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

const stateIncrementTestChain = testBase;

const newDeployRegex = /Deployment created successfully. DeployID is: (.*)$/m;

describe("deploy:update and deploy:status tests", function () {
    this.slow(5 * 1000);
    this.timeout(20 * 1000);
    let deployID = "NOTFOUND";

    // These tests must all use a single temp directory where the
    // state_history can be shared and built upon
    mochaTmpdir.all("adapt-cli-test-deploy");

    before(async function () {
        this.timeout(5 * 1000);
        const indexTsx = stateUpdateIndexTsx("{count: 1}", "(_prev, _props) => ({ count: 1 })");
        await createProject(basicPackageJson, indexTsx, "index.tsx");
    });

    stateIncrementTestChain
    .do(async () => fs.outputFile("index.tsx",
        stateUpdateIndexTsx("{count: 1}", "(_prev, _props) => ({ count: 1 })")))
    .command(["deploy:run", "dev"])

    .it("Should create initial state", async (ctx) => {
        expect(ctx.stderr).equals("");
        expect(ctx.stdout).contains("Validating project [completed]");
        expect(ctx.stdout).contains("Creating new project deployment [completed]");
        expect(ctx.stdout).contains(`Deployment created successfully. DeployID is:`);
        expect(ctx.stdout).does.not.contain("WARNING");

        const matches = ctx.stdout.match(newDeployRegex);
        expect(matches).to.be.an("array").with.length(2);
        if (matches && matches[1]) deployID = matches[1];

        checkPluginStdout(ctx.stdout);

        await checkStateUpdateState(1);
    });

    stateIncrementTestChain
    .do(async () => fs.outputFile("index.tsx",
        stateUpdateIndexTsx("{count: 1}", "(_prev, _props) => ({ count: 2 })")))
    .delayedcommand(() => ["update", deployID])

    .it("Should create second state (without stack arg, using alias)", async (ctx) => {
        expect(ctx.stderr).equals("");
        expect(ctx.stdout).contains("Validating project [completed]");
        expect(ctx.stdout).contains("Updating project deployment [completed]");
        expect(ctx.stdout).contains(`Deployment ${deployID} updated successfully`);
        expect(ctx.stdout).does.not.contain("WARNING");

        checkPluginStdout(ctx.stdout);

        await checkStateUpdateState(2);
    });

    stateIncrementTestChain
    .do(async () => fs.outputFile("index.tsx",
        stateUpdateIndexTsx("{count: 1}", "(_prev, _props) => ({ count: 3 })")))
    .delayedcommand(() => ["deploy:update", deployID, "dev"])

    .it("Should create third state (with stack arg)", async (ctx) => {
        expect(ctx.stderr).equals("");
        expect(ctx.stdout).contains("Validating project [completed]");
        expect(ctx.stdout).contains("Updating project deployment [completed]");
        expect(ctx.stdout).contains(`Deployment ${deployID} updated successfully`);
        expect(ctx.stdout).does.not.contain("WARNING");

        checkPluginStdout(ctx.stdout);

        await checkStateUpdateState(3);
    });

    stateIncrementTestChain
    .delayedcommand(() => ["deploy:status", deployID])

    .it("Should report status", async (ctx) => {
        expect(ctx.stderr).equals("");
        expect(ctx.stdout).contains(`Deployment ${deployID} status:`);
        expect(ctx.stdout).contains(`{
      "noStatus": "element has no children"
    }`);
        expect(ctx.stdout).does.not.contain("WARNING");
    });

    stateIncrementTestChain
    .delayedcommand(() => ["status", deployID])

    .it("Should report status (using alias)", async (ctx) => {
        expect(ctx.stderr).equals("");
        expect(ctx.stdout).contains(`Deployment ${deployID} status:`);
        expect(ctx.stdout).contains(`{
      "noStatus": "element has no children"
    }`);
        expect(ctx.stdout).does.not.contain("WARNING");
    });
});

describe("deploy:run negative tests", () => {
    mochaTmpdir.each("adapt-cli-test-deploy");

    testBase
    .command(["deploy:run", "--rootFile", "doesntexist", "dev"])
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
    .command(["deploy:run", "--rootFile", "test.ts", "dev"])
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
    .command(["deploy:run", "dev"])
    .command(["deploy:update", "abc123"])
    .catch((err: any) => {
        expect(err.message).contains(
            "Deployment 'abc123' does not exist");
    })
    .it("Should fail if deployment doesn't exist");
});
