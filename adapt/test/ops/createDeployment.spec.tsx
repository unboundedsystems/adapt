import {
    localRegistryDefaults,
    mochaLocalRegistry,
    mochaTmpdir as tmpdir,
    npm
} from "@usys/utils";
import * as fs from "fs-extra";
import * as path from "path";
import * as should from "should";

import { createMockLogger, MockLogger, pkgRootDir } from "../testlib";

import { DeployState, isDeploySuccess } from "../../src/ops/common";
import { createDeployment } from "../../src/ops/createDeployment";
import { listDeployments } from "../../src/server/deployment";
import { LocalServer } from "../../src/server/local_server";
import { adaptServer, AdaptServerType, mockServerTypes_ } from "../../src/server/server";

const simplePackageJson = {
    name: "test_project",
    version: "1.0.0",
    dependencies: {
        "source-map-support": "^0.5.5",
        "@types/node": "^8.10.14",
        "@usys/adapt": `file:${pkgRootDir}/../adapt`,
    }
};

const simpleIndexTsx = `
import Adapt, { PrimitiveComponent } from "@usys/adapt";
import "./simple_plugin";

class Simple extends PrimitiveComponent<{}> {}
class ActError extends PrimitiveComponent<{}> {}
class AnalyzeError extends PrimitiveComponent<{}> {}

Adapt.stack("default", <Simple />);
Adapt.stack("ActError", <ActError />);
Adapt.stack("AnalyzeError", <AnalyzeError />);
`;

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
        this.log("observe");
        return {};
    }
    analyze(_oldDom: any, dom: any, _obs: {}): Action[] {
        this.log("analyze");
        if (dom.componentType.name === "AnalyzeError") {
            throw new Error("AnalyzeError");
        }
        if (dom.componentType.name === "ActError") {
            return [
                { description: "echo error", act: () => { throw new Error("ActError1"); } },
                { description: "echo error", act: () => { throw new Error("ActError2"); } }
            ];
        }
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

function checkErrors(ds: DeployState, expected: RegExp[]) {
    const errors = ds.messages.filter((m) => m.type === "error");
    should(errors).have.length(expected.length);
    for (let i = 0; i < expected.length; i++) {
        should(errors[i].content).match(expected[i]);
    }
    should(ds.summary.error).equal(expected.length);
}

describe("createDeployment Tests", async function() {
    let origServerTypes: AdaptServerType[];
    let logger: MockLogger;
    let projectInit = false; // first test initialized project dir
    let firstDeployID: string;

    this.timeout(30000);
    mochaLocalRegistry.all(localRegistryDefaults.config,
                           localRegistryDefaults.configPath);
    tmpdir.all("adapt-createDeployment");

    before(() => {
        origServerTypes = mockServerTypes_();
        mockServerTypes_([LocalServer]);
    });
    after(() => {
        mockServerTypes_(origServerTypes);
    });
    beforeEach(() => {
        logger = createMockLogger();
    });

    it("Should build a single file", async () => {
        await fs.writeFile("index.tsx", simpleIndexTsx);
        await fs.writeFile("package.json",
                           JSON.stringify(simplePackageJson, null, 2));
        await fs.outputFile(path.join("simple_plugin", "index.ts"), simplePluginTs);
        await fs.outputFile(path.join("simple_plugin", "package.json"), simplePluginPackageJson);

        await npm.install(localRegistryDefaults.npmLocalProxyOpts);

        const adaptUrl = `file://${process.cwd()}/db.json`;
        const ds = await createDeployment({
            adaptUrl,
            fileName: "index.tsx",
            initLocalServer: true,
            initialStateJson: "{}",
            logger,
            projectName: "myproject",
            stackName: "default",
        });
        if (!isDeploySuccess(ds)) {
            should(isDeploySuccess(ds)).be.True();
            return;
        }

        should(ds.summary.error).equal(0);
        should(ds.domXml).equal(
`<Adapt>
  <Simple key="Simple" xmlns="urn:Adapt:test_project:1.0.0:$adaptExports:index.tsx:Simple"/>
</Adapt>
`);

        should(ds.stateJson).equal("{}");
        should(ds.deployID).equal("myproject::default");
        firstDeployID = ds.deployID;

        const stdout = logger.stdout;
        should(stdout).match(/EchoPlugin: start/);
        should(stdout).match(/EchoPlugin: observe/);
        should(stdout).match(/EchoPlugin: analyze/);
        should(stdout).match(/action1/);
        should(stdout).match(/action2/);
        should(stdout).match(/EchoPlugin: finish/);

        const server = await adaptServer(adaptUrl, {});
        const list = await listDeployments(server);
        should(list).have.length(1);
        should(list[0]).equal(ds.deployID);

        projectInit = true;
    });

    async function checkPluginError(stackName: string, expected: RegExp[]) {
        should(projectInit).equal(true, "Previous test did not complete");

        const adaptUrl = `file://${process.cwd()}/db.json`;

        const ds = await createDeployment({
            adaptUrl,
            fileName: "index.tsx",
            initialStateJson: "{}",
            logger,
            projectName: "myproject",
            stackName,
        });
        if (isDeploySuccess(ds)) {
            should(isDeploySuccess(ds)).be.False();
            return;
        }

        checkErrors(ds, expected);

        // Only the previous deployment should be there
        const server = await adaptServer(adaptUrl, {});
        const list = await listDeployments(server);
        should(list).have.length(1);
        should(list[0]).equal(firstDeployID);
    }

    it("Should log error on analyze", async () => {
        await checkPluginError("AnalyzeError", [
            /Error creating deployment: Error: AnalyzeError/
        ]);
    });

    it("Should log error on action", async () => {
        await checkPluginError("ActError", [
            /Error: ActError1/,
            /Error: ActError2/,
            /Error creating deployment: Error: Errors encountered during plugin action phase/
        ]);
    });
});

/*****
 * FIXME(mark): This is a system test and needs moved to cli in an
 * upcoming commit
 *
describe("buildStack Nodecellar example project", function() {
    this.timeout(20000);
    tmpdir.each("adapt-buildStack",
                {copy: path.join(pkgRootDir, "test_projects", "nodecellar")});

    it("Should build nodecellar demo", () => {

        const packages = [
            "file:" + pkgRootDir,
            "file:" + path.join(pkgRootDir, "..", "cloud")
        ];
        await npm.install();
        await npm.install({packages});

        const out = buildStack("index.tsx", "dev", {});

        if (out.dom == null) {
            should(out.dom).not.be.Null();
            return;
        }
        should(out.dom instanceof AdaptPrimitiveElementImpl).be.True();
        const el = out.dom as AdaptPrimitiveElementImpl<any>;
        should(el.componentInstance instanceof PrimitiveComponent).be.True();
    });
});
*/
