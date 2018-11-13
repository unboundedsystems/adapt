import {
    createMockLogger,
    localRegistryDefaults,
    mochaLocalRegistry,
    mochaTmpdir as tmpdir,
    MockLogger,
} from "@usys/testutils";
import {
    messagesToString,
    npm
} from "@usys/utils";
import * as fs from "fs-extra";
import * as path from "path";
import * as should from "should";
import { stdout } from "stdout-stderr";

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
        "@types/node": "^8.10.20",
        "@usys/adapt": "0.0.1",
        "typescript": "^2.9.2",
    }
};

const simpleIndexTsx = `
import Adapt, { Component, gql, Observer, PrimitiveComponent, registerObserver } from "@usys/adapt";
import MockObserver from "@usys/adapt/dist/src/observers/MockObserver";
import "./simple_plugin";

class Simple extends PrimitiveComponent<{}> {}
class ActError extends PrimitiveComponent<{}> {}
class AnalyzeError extends PrimitiveComponent<{}> {}

class BuildNull extends Component<{}> {
    build() { return null; }
}

class ObserverToSimple extends Component<{ observer: { observerName: string } }> {
    static defaultProps = { observer: MockObserver };

    build() {
        return <Observer
            observer={this.props.observer}
            query={ gql\`query { mockById(id: "1") { idSquared } }\` }
            build={ (err, props)=>{
                        console.log("Props:", props, err);
                        return <Simple key="Simple" />;
            } } />;
    }
}


registerObserver(new MockObserver(true), "neverObserve");

async function makeSimple() {
    return <Simple />;
}
async function makeNull() {
    return null;
}

Adapt.stack("default", <Simple />);
Adapt.stack("ActError", <ActError />);
Adapt.stack("AnalyzeError", <AnalyzeError />);
Adapt.stack("null", null);
Adapt.stack("BuildNull", <BuildNull />);
Adapt.stack("ObserverToSimple", <ObserverToSimple />);
Adapt.stack("NeverObserverToSimple", <ObserverToSimple observer={{ observerName: "neverObserve" }}/>);
Adapt.stack("promises", makeSimple(), makeNull());
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
    let adaptUrl: string;
    let server_: AdaptServer;

    async function server(): Promise<AdaptServer> {
        if (!server_) {
            server_ = await adaptServer(adaptUrl, { init: true });
        }
        return server_;
    }

    this.timeout(20 * 1000);

    tmpdir.all("adapt-createDeployment");
    const localRegistry = mochaLocalRegistry.all({
        publishList: localRegistryDefaults.defaultPublishList
    });

    before(async () => {
        this.timeout(30 * 1000);
        origServerTypes = mockServerTypes_();
        mockServerTypes_([LocalServer]);
        adaptUrl = `file://${process.cwd()}/`;
        await createProject();
    });
    after(() => {
        mockServerTypes_(origServerTypes);
    });
    beforeEach(() => {
        logger = createMockLogger();
    });
    afterEach(async () => {
        stdout.stop();
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
            throw new Error("Failure: " + messagesToString(ds.messages));
        }

        const list = await listDeployments(await server());
        should(list).have.length(1);
        should(list[0]).equal(ds.deployID);
        return ds;
    }

    function restore(func: () => any) {
        return async () => {
            try {
                return await func();
            } finally {
                stdout.stop();
            }
        };
    }

    async function createProject() {
        await fs.writeFile("index.tsx", simpleIndexTsx);
        await fs.writeFile("package.json",
            JSON.stringify(simplePackageJson, null, 2));
        await fs.outputFile(path.join("simple_plugin", "index.ts"), simplePluginTs);
        await fs.outputFile(path.join("simple_plugin", "package.json"), simplePluginPackageJson);

        await npm.install(localRegistry.npmProxyOpts);
    }

    it("Should build a single file", async () => {
        const ds = await createSuccess("default");

        should(ds.domXml).equal(defaultDomXmlOutput);
        should(ds.stateJson).equal("{}");
        should(ds.deployID).equal("myproject::default");
        should(ds.mountedOrigStatus).eql({ noStatus: true });

        const lstdout = logger.stdout;
        should(lstdout).match(/EchoPlugin: start/);
        should(lstdout).match(/EchoPlugin: observe/);
        should(lstdout).match(/EchoPlugin: analyze/);
        should(lstdout).match(/action1/);
        should(lstdout).match(/action2/);
        should(lstdout).match(/EchoPlugin: finish/);
    });

    it("Should build stack that is a promise", async () => {
        const ds = await createSuccess("promises");

        should(ds.domXml).equal(defaultDomXmlOutput);
        should(ds.stateJson).equal("{}");
        should(ds.deployID).equal("myproject::promises");

        const lstdout = logger.stdout;
        should(lstdout).match(/EchoPlugin: start/);
        should(lstdout).match(/EchoPlugin: observe/);
        should(lstdout).match(/EchoPlugin: analyze/);
        should(lstdout).match(/action1/);
        should(lstdout).match(/action2/);
        should(lstdout).match(/EchoPlugin: finish/);
    });

    it("Should log error on analyze", async () => {
        await createError("AnalyzeError", [
            /Error creating deployment: Error: AnalyzeError/
        ]);
    });

    it("Should log error on action", async () => {
        await createError("ActError", [
            /Error: ActError1/,
            /Error: ActError2/,
            /Error creating deployment: Error: Errors encountered during plugin action phase/
        ]);
    });

    it("Should deploy and update a stack with null root", async () => {
        const ds1 = await createSuccess("null");

        should(ds1.summary.error).equal(0);
        should(ds1.domXml).equal(`<Adapt/>\n`);

        should(ds1.stateJson).equal("{}");

        const lstdout = logger.stdout;
        should(lstdout).match(/EchoPlugin: start/);
        should(lstdout).match(/EchoPlugin: observe/);
        should(lstdout).match(/EchoPlugin: analyze/);
        should(lstdout).match(/action1/);
        should(lstdout).match(/action2/);
        should(lstdout).match(/EchoPlugin: finish/);

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
        const ds1 = await createSuccess("BuildNull");

        should(ds1.summary.error).equal(0);
        should(ds1.domXml).equal(`<Adapt/>\n`);

        should(ds1.stateJson).equal("{}");

        const lstdout = logger.stdout;
        should(lstdout).match(/EchoPlugin: start/);
        should(lstdout).match(/EchoPlugin: observe/);
        should(lstdout).match(/EchoPlugin: analyze/);
        should(lstdout).match(/action1/);
        should(lstdout).match(/action2/);
        should(lstdout).match(/EchoPlugin: finish/);

    });

    it("Should deploy and update a stack with observer", restore(async () => {
        stdout.print = false;
        stdout.start();
        const ds1 = await createSuccess("ObserverToSimple");
        stdout.stop();

        should(ds1.summary.error).equal(0);
        should(ds1.domXml).equal(defaultDomXmlOutput);

        should(stdout.output).match(/Props: undefined null/);
        should(stdout.output).match(/Props: { mockById: { idSquared: 1 } } null/);

        const lstdout = logger.stdout;
        should(lstdout).match(/EchoPlugin: start/);
        should(lstdout).match(/EchoPlugin: observe/);
        should(lstdout).match(/EchoPlugin: analyze/);
        should(lstdout).match(/action1/);
        should(lstdout).match(/action2/);
        should(lstdout).match(/EchoPlugin: finish/);

        // Now update the deployment
        stdout.start();
        const ds2 = await updateDeployment({
            adaptUrl,
            deployID: ds1.deployID,
            fileName: "index.tsx",
            logger,
            prevStateJson: "{}",
            stackName: "ObserverToSimple",
        });
        stdout.stop();
        if (!isDeploySuccess(ds2)) {
            should(isDeploySuccess(ds2)).be.True();
            return;
        }

        should(ds2.summary.error).equal(0);
        should(ds2.domXml).equal(defaultDomXmlOutput);

        should(stdout.output).not.match(/Props: undefined null/);
        should(stdout.output).match(/Props: { mockById: { idSquared: 1 } } null/);

    }));

    it("Should report queries that need data after observation pass", restore(async () => {
        stdout.print = false;
        stdout.start();
        const ds1 = await createSuccess("NeverObserverToSimple");
        stdout.stop();

        should(ds1.summary.error).equal(0);
        should(ds1.domXml).equal(defaultDomXmlOutput);

        should(stdout.output).match(/Props: undefined null/);
        should(stdout.output).match(/Props: undefined null/);

        should(ds1.needsData).eql({ neverObserve: [{ query: "{\n  mockById(id: \"1\") {\n    idSquared\n  }\n}\n" }] });

        const lstdout = logger.stdout;
        should(lstdout).match(/EchoPlugin: start/);
        should(lstdout).match(/EchoPlugin: observe/);
        should(lstdout).match(/EchoPlugin: analyze/);
        should(lstdout).match(/action1/);
        should(lstdout).match(/action2/);
        should(lstdout).match(/EchoPlugin: finish/);
    }));
});
