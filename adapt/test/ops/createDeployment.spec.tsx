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

import { createDeployment, updateDeployment } from "../../src/ops";
import { DeployError, DeployState, DeploySuccess, isDeploySuccess } from "../../src/ops/common";
import { destroyDeployment, listDeployments } from "../../src/server/deployment";
import { LocalServer } from "../../src/server/local_server";
import { adaptServer, AdaptServer, AdaptServerType, mockServerTypes_ } from "../../src/server/server";

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
import Adapt, { Component, PrimitiveComponent } from "@usys/adapt";
import "./simple_plugin";

class Simple extends PrimitiveComponent<{}> {}
class ActError extends PrimitiveComponent<{}> {}
class AnalyzeError extends PrimitiveComponent<{}> {}

class BuildNull extends Component<{}> {
    build() { return null; }
}

Adapt.stack("default", <Simple />);
Adapt.stack("ActError", <ActError />);
Adapt.stack("AnalyzeError", <AnalyzeError />);
Adapt.stack("null", null);
Adapt.stack("BuildNull", <BuildNull />);
`;

const defaultDomXmlOutput =
`<Adapt>
  <Simple key="Simple" xmlns="urn:Adapt:test_project:1.0.0:$adaptExports:index.tsx:Simple"/>
</Adapt>
`;

const simplePluginTs = `
import { Action, AdaptElementOrNull, Plugin, PluginOptions, registerPlugin } from "@usys/adapt";

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
    async observe(_oldDom: AdaptElementOrNull, dom: AdaptElementOrNull) {
        this.log("observe");
        return {};
    }
    analyze(_oldDom: AdaptElementOrNull, dom: AdaptElementOrNull, _obs: {}): Action[] {
        this.log("analyze");
        if (dom != null && dom.componentType.name === "AnalyzeError") {
            throw new Error("AnalyzeError");
        }
        if (dom != null && dom.componentType.name === "ActError") {
            return [
                // First action is purposely NOT returning a promise and doing
                // a synchronous throw
                { description: "echo error", act: () => { throw new Error("ActError1"); } },
                // Second action is correctly implemented as an async function
                // so will return a rejected promise.
                { description: "echo error", act: async () => { throw new Error("ActError2"); } }
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

describe("createDeployment Tests", async function () {
    let origServerTypes: AdaptServerType[];
    let logger: MockLogger;
    let projectInit = false; // first test initialized project dir
    let adaptUrl: string;
    let server_: AdaptServer;

    async function server(): Promise<AdaptServer> {
        if (!server_) {
            server_ = await adaptServer(adaptUrl, {init: true});
        }
        return server_;
    }

    this.timeout(30000);
    mochaLocalRegistry.all(localRegistryDefaults.config,
                           localRegistryDefaults.configPath);
    tmpdir.all("adapt-createDeployment");

    before(() => {
        origServerTypes = mockServerTypes_();
        mockServerTypes_([LocalServer]);
        adaptUrl = `file://${process.cwd()}/`;
    });
    after(() => {
        mockServerTypes_(origServerTypes);
    });
    beforeEach(() => {
        logger = createMockLogger();
    });
    afterEach(async () => {
        const s = await server();
        let list = await listDeployments(s);
        for (const id of list) {
            await destroyDeployment(s, id);
        }

        list = await listDeployments(await server());
        should(list).have.length(0);
    });

    async function doCreate(stackName: string): Promise<DeployState> {
        return createDeployment({
            adaptUrl,
            fileName: "index.tsx",
            initLocalServer: true,
            initialStateJson: "{}",
            logger,
            projectName: "myproject",
            stackName,
        });
    }

    async function createError(stackName: string,
                               expectedErrs: RegExp[]): Promise<DeployError> {
        const ds = await doCreate(stackName);
        if (isDeploySuccess(ds)) {
            should(isDeploySuccess(ds)).be.False();
            throw new Error();
        }
        checkErrors(ds, expectedErrs);

        const list = await listDeployments(await server());
        should(list).have.length(0);
        return ds;
    }

    async function createSuccess(stackName: string): Promise<DeploySuccess> {
        const ds = await doCreate(stackName);
        if (!isDeploySuccess(ds)) {
            should(isDeploySuccess(ds)).be.True();
            throw new Error();
        }

        const list = await listDeployments(await server());
        should(list).have.length(1);
        should(list[0]).equal(ds.deployID);
        return ds;
    }

    it("Should build a single file", async () => {
        await fs.writeFile("index.tsx", simpleIndexTsx);
        await fs.writeFile("package.json",
                           JSON.stringify(simplePackageJson, null, 2));
        await fs.outputFile(path.join("simple_plugin", "index.ts"), simplePluginTs);
        await fs.outputFile(path.join("simple_plugin", "package.json"), simplePluginPackageJson);

        await npm.install(localRegistryDefaults.npmLocalProxyOpts);
        projectInit = true;

        const ds = await createSuccess("default");

        should(ds.domXml).equal(defaultDomXmlOutput);
        should(ds.stateJson).equal("{}");
        should(ds.deployID).equal("myproject::default");

        const stdout = logger.stdout;
        should(stdout).match(/EchoPlugin: start/);
        should(stdout).match(/EchoPlugin: observe/);
        should(stdout).match(/EchoPlugin: analyze/);
        should(stdout).match(/action1/);
        should(stdout).match(/action2/);
        should(stdout).match(/EchoPlugin: finish/);

    });

    it("Should log error on analyze", async () => {
        should(projectInit).equal(true, "Previous test did not complete");
        await createError("AnalyzeError", [
            /Error creating deployment: Error: AnalyzeError/
        ]);
    });

    it("Should log error on action", async () => {
        should(projectInit).equal(true, "Previous test did not complete");
        await createError("ActError", [
            /Error: ActError1/,
            /Error: ActError2/,
            /Error creating deployment: Error: Errors encountered during plugin action phase/
        ]);
    });

    it("Should deploy and update a stack with null root", async () => {
        should(projectInit).equal(true, "Previous test did not complete");

        const ds1 = await createSuccess("null");

        should(ds1.summary.error).equal(0);
        should(ds1.domXml).equal(`<Adapt/>\n`);

        should(ds1.stateJson).equal("{}");

        const stdout = logger.stdout;
        should(stdout).match(/EchoPlugin: start/);
        should(stdout).match(/EchoPlugin: observe/);
        should(stdout).match(/EchoPlugin: analyze/);
        should(stdout).match(/action1/);
        should(stdout).match(/action2/);
        should(stdout).match(/EchoPlugin: finish/);

        // Now update the deployment
        const ds2 = await updateDeployment({
            adaptUrl,
            deployID: ds1.deployID,
            fileName: "index.tsx",
            logger,
            prevStateJson: "{}",
            stackName: "default",
        });
        if (!isDeploySuccess(ds2)) {
            should(isDeploySuccess(ds2)).be.True();
            return;
        }

        should(ds2.summary.error).equal(0);
        should(ds2.domXml).equal(defaultDomXmlOutput);
        should(ds2.stateJson).equal("{}");
    });

    it("Should deploy a stack that builds to null", async () => {
        should(projectInit).equal(true, "Previous test did not complete");

        const ds1 = await createSuccess("BuildNull");

        should(ds1.summary.error).equal(0);
        should(ds1.domXml).equal(`<Adapt/>\n`);

        should(ds1.stateJson).equal("{}");

        const stdout = logger.stdout;
        should(stdout).match(/EchoPlugin: start/);
        should(stdout).match(/EchoPlugin: observe/);
        should(stdout).match(/EchoPlugin: analyze/);
        should(stdout).match(/action1/);
        should(stdout).match(/action2/);
        should(stdout).match(/EchoPlugin: finish/);

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
