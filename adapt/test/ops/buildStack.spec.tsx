import { mochaTmpdir as tmpdir, npm } from "@usys/utils";
import * as fs from "fs-extra";
import * as path from "path";
import * as should from "should";

import { createMockLogger, MockLogger, pkgRootDir } from "../testlib";

import { buildStack } from "../../src/ops/buildStack";
import { LocalServer } from "../../src/server/local_server";
import { AdaptServerType, mockServerTypes_ } from "../../src/server/server";

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
Adapt.stack("default", <Simple />);
`;

const simplePluginTs = `
import { Action, Plugin, PluginOptions, registerPlugin } from "@usys/adapt";

class EchoPlugin implements Plugin {
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
    async observe(dom: any) {
        this.log("observe");
    }
    analyze(dom: any): Action[] {
        this.log("analyze");
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

describe("buildStack Tests", async function() {
    let origServerTypes: AdaptServerType[];
    let logger: MockLogger;

    this.timeout(30000);
    tmpdir.each("adapt-buildStack");

    beforeEach(() => {
        origServerTypes = mockServerTypes_();
        mockServerTypes_([LocalServer]);
        logger = createMockLogger();
    });
    afterEach(() => {
        mockServerTypes_(origServerTypes);
    });

    it("Should build a single file", async () => {
        await fs.writeFile("index.tsx", simpleIndexTsx);
        await fs.writeFile("package.json",
                           JSON.stringify(simplePackageJson, null, 2));
        await fs.outputFile(path.join("simple_plugin", "index.ts"), simplePluginTs);
        await fs.outputFile(path.join("simple_plugin", "package.json"), simplePluginPackageJson);

        await npm.install();

        const bs = await buildStack({
            adaptUrl: `file://${process.cwd()}/db.json`,
            deployID: "new",
            fileName: "index.tsx",
            initLocalServer: true,
            initialStateJson: "{}",
            log: logger.log,
            projectName: "myproject",
            stackName: "default",
        });

        should(bs.messages.length).equal(0);
        should(bs.domXml).equal(
`<Adapt>
  <Simple key="Simple"/>
</Adapt>
`);

        should(bs.stateJson).equal("{}");
        should(bs.deployId).equal("myproject::default");

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
