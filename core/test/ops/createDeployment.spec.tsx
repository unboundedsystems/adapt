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

import {
    createMockLoggerClient,
    mochaLocalRegistry,
    mochaTmpdir as tmpdir,
    MockLoggerClient,
    repoVersions,
} from "@adpt/testutils";
import {
    grep,
    messagesToString,
    MessageType,
    yarn,
} from "@adpt/utils";
import * as fs from "fs-extra";
import * as path from "path";
import should from "should";

import { createDeployment, fetchStatus, updateDeployment } from "../../src/ops";
import { DeployError, DeployState, DeploySuccess, isDeploySuccess } from "../../src/ops/common";
import { destroyDeployment, listDeploymentIDs } from "../../src/server/deployment";
import { LocalServer } from "../../src/server/local_server";
import { adaptServer, AdaptServer, AdaptServerType, mockServerTypes_ } from "../../src/server/server";

const simplePackageJson = {
    name: "test_project",
    version: "1.0.0",
    dependencies: {
        "source-map-support": "^0.5.5",
        "@types/node": "^8.10.20",
        "@adpt/core": repoVersions.core,
        "typescript": "^3.0.3",
    }
};

const simpleIndexTsx = `
import Adapt, {
    AdaptElementOrNull,
    Component,
    Constructor,
    gql,
    Group,
    handle,
    Handle,
    Observer,
    PrimitiveComponent,
    registerObserver,
    WithChildren,
    useDependsOn,
} from "@adpt/core";
import MockObserver from "@adpt/core/dist/src/observers/MockObserver";
import "./simple_plugin";

export class Simple extends PrimitiveComponent<{}> {
    async status() { return { status: "Here I am!" }; }
}
class ActError extends PrimitiveComponent<{}> {}
class AnalyzeError extends PrimitiveComponent<{}> {}
export class DeleteError extends PrimitiveComponent<{ dep?: Handle }> {
    dependsOn = (goal, helpers) => {
        if (this.props.dep) return helpers.dependsOn(this.props.dep);
    };
}

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
                        console.log("Props:", JSON.stringify(props), err);
                        return makeTwo(Simple);
            } } />;
    }
}

registerObserver(new MockObserver(true), "neverObserve");

async function makeSimple() {
    return makeTwo(Simple);
}
async function makeNull() {
    return null;
}
async function makeErr(): Promise<AdaptElementOrNull> {
    throw new Error("makeErr");
}

function BuildError(props: { error: boolean; }) {
    if (props.error) throw new Error("This is a build error");
    return <Simple />;
}

function makeTwo(Comp: Constructor<Component<WithChildren>>) {
    const key = Comp.name;
    return <Comp key={key}><Comp key={key} /></Comp>;
}

function DeleteErrorApp() {
    const h = handle();
    return (
        <Group>
            <DeleteError handle={h} />
            <DeleteError dep={h} />
        </Group>
    );
}

function ToSimple({ dep }: { dep?: Handle; }) {
    useDependsOn((goal, helpers) => dep && helpers.dependsOn(dep));
    return <Simple />;
}

// This app tests the primitiveDependencies functionality by placing a
// dependency between non-primitive components. That means the dependency
// will only be saved in primitiveDependencies, not the DOM and must be
// re-hydrated correctly from storage in order for the delete of this app
// to occur in the correct order.
// Create order: 0, 2, 1
// Delete order: 1, 2, 0
function PrimDependsApp() {
    const h = [ handle(), handle(), handle() ];
    return (
        <Group>
            <ToSimple handle={h[0]} />
            <ToSimple handle={h[1]} dep={h[2]} />
            <ToSimple handle={h[2]} dep={h[0]} />
        </Group>
    )
}

Adapt.stack("default", makeTwo(Simple));
Adapt.stack("ActError", <Group><ActError /><ActError /></Group>);
Adapt.stack("AnalyzeError", <AnalyzeError />);
Adapt.stack("null", null);
Adapt.stack("BuildNull", <BuildNull />);
Adapt.stack("ObserverToSimple", <ObserverToSimple />);
Adapt.stack("NeverObserverToSimple", <ObserverToSimple observer={{ observerName: "neverObserve" }}/>);
Adapt.stack("promises", makeSimple(), makeNull());
Adapt.stack("promises-err", makeSimple(), makeErr());
Adapt.stack("promise-func", makeSimple(), makeNull);
Adapt.stack("promise-func-err", makeSimple(), makeErr);
Adapt.stack("BuildError", <BuildError error={true} />);
Adapt.stack("DeleteError", <DeleteErrorApp />);
Adapt.stack("PrimDepends", <PrimDependsApp />);
`;

function defaultDomXmlOutput(namespace: string[]) {
    const ns2 = namespace.concat("Simple");
    return `<Adapt>
  <Simple key="Simple" xmlns="urn:Adapt:test_project:1.0.0::index.tsx:Simple">
    <Simple key="Simple" xmlns="urn:Adapt:test_project:1.0.0::index.tsx:Simple">
      <__lifecycle__>
        <field name="stateNamespace">${JSON.stringify(ns2)}</field>
        <field name="keyPath">["Simple","Simple"]</field>
        <field name="path">"/Simple/Simple"</field>
      </__lifecycle__>
    </Simple>
    <__lifecycle__>
      <field name="stateNamespace">${JSON.stringify(namespace)}</field>
      <field name="keyPath">["Simple"]</field>
      <field name="path">"/Simple"</field>
    </__lifecycle__>
  </Simple>
</Adapt>
`;
}

const simplePluginTs = `
import {
    Action,
    AdaptElement,
    AdaptElementOrNull,
    AdaptMountedElement,
    childrenToArray,
    domDiff,
    FinalDomElement,
    ChangeType,
    Plugin,
    PluginOptions,
    registerPlugin,
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
    async observe(_oldDom: AdaptElementOrNull, dom: AdaptElementOrNull) {
        this.log("observe");
        return {};
    }

    analyze(oldDom: AdaptMountedElement | null, dom: AdaptMountedElement | null, _obs: {}): Action[] {
        this.log("analyze");
        const { added, deleted, commonNew } = domDiff(oldDom, dom);
        const actions: Action[] = [];

        const actErrors = [
            // First action is purposely NOT returning a promise and doing
            // a synchronous throw
            () => { throw new Error("ActError1"); },
            // Second action is correctly implemented as an async function
            // so will return a rejected promise.
            async () => { throw new Error("ActError2"); },
        ];
        let actErrNum = 0;
        let elNum = 1;

        const info = (el: AdaptElement, type: ChangeType, what = "action") => {
            const detail = "echo " + what + elNum;
            return {
                detail,
                type,
                changes: [{
                    detail,
                    type,
                    element: el as FinalDomElement,
                }],
            };
        };

        for (const el of added) {
            switch (el.componentType.name) {
                case "Group":
                    continue;

                case "AnalyzeError":
                    throw new Error("AnalyzeError");

                case "ActError":
                    actions.push({ ...info(el, ChangeType.create, "error"), act: actErrors[actErrNum]});
                    actErrNum = (actErrNum + 1) % actErrors.length;
                    break;

                default:
                    const actStr = "action" + elNum;
                    actions.push({ ...info(el, ChangeType.create), act: () => this.doAction(actStr)})
                    break;
            }
            elNum++;
        }

        for (const el of deleted) {
            switch (el.componentType.name) {
                case "Group":
                    continue;

                case "DeleteError":
                    actions.push({ ...info(el, ChangeType.delete, "delete"), act: async () => { throw new Error("DeleteError"); } });
                    break;

                default:
                    const actStr = "delete" + elNum;
                    actions.push({ ...info(el, ChangeType.delete, "delete"), act: () => this.doAction(actStr)})
                    break;
            }
            elNum++;
        }

        for (const el of commonNew) {
            switch (el.componentType.name) {
                case "Group":
                    continue;

                default:
                    const actStr = "action" + elNum;
                    actions.push({ ...info(el, ChangeType.modify), act: () => this.doAction(actStr)})
                    break;
            }
            elNum++;
        }
        return actions;
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

type ExpectedMsg = string | RegExp;

function checkMessages(ds: DeployState, expected: ExpectedMsg[],
    type: MessageType = MessageType.error) {

    const msgs = ds.messages.filter((m) => m.type === type);
    should(msgs).have.length(expected.length);
    for (let i = 0; i < expected.length; i++) {
        if (typeof expected[i] === "string") {
            should(msgs[i].content).equal(expected[i]);
        } else {
            should(msgs[i].content).match(expected[i]);
        }
    }
    should(ds.summary[type]).equal(expected.length);
}

describe("createDeployment Tests", async function () {
    let origServerTypes: AdaptServerType[];
    let client: MockLoggerClient;
    let adaptUrl: string;
    let server_: AdaptServer;

    async function server(): Promise<AdaptServer> {
        if (!server_) {
            server_ = await adaptServer(adaptUrl, { init: true });
        }
        return server_;
    }

    const baseTimeout = 40 * 1000; // To do a single create
    const opTimeout = 20 * 1000;   // Additional ops like status or update
    this.timeout(baseTimeout);

    tmpdir.all("adapt-createDeployment");
    const localRegistry = mochaLocalRegistry.all({
        port: "shared",
    });

    before(async function () {
        this.timeout(30 * 1000);
        origServerTypes = mockServerTypes_();
        mockServerTypes_([LocalServer]);
        adaptUrl = `file://${process.cwd()}/`;
        await createProject();
    });
    after("cleanup server", async () => {
        mockServerTypes_(origServerTypes);
        if (server_) await server_.destroy();
    });
    beforeEach(() => {
        client = createMockLoggerClient();
    });
    afterEach(async function () {
        this.timeout(10 * 1000);
        const s = await server();
        let list = await listDeploymentIDs(s);
        for (const id of list) {
            await destroyDeployment(s, id);
        }

        list = await listDeploymentIDs(await server());
        should(list).have.length(0);
    });

    interface DoCreate {
        deployID?: string;
        stackName: string;
    }

    async function doCreate(ops: DoCreate): Promise<DeployState> {
        return createDeployment({
            ...ops,
            adaptUrl,
            fileName: "index.tsx",
            initLocalServer: true,
            initialStateJson: "{}",
            client,
            projectName: "myproject",
        });
    }

    async function createError(stackName: string, expectedErrs: ExpectedMsg[],
        expectedWarnings?: ExpectedMsg[], actError = false): Promise<DeployError> {
        const ds = await doCreate({ stackName });
        if (isDeploySuccess(ds)) {
            should(isDeploySuccess(ds)).be.False();
            throw new Error();
        }
        checkMessages(ds, expectedErrs, MessageType.error);
        if (expectedWarnings) checkMessages(ds, expectedWarnings, MessageType.warning);

        const list = await listDeploymentIDs(await server());
        // If the error occurred during the act phase, the deployment should
        // still exist. If it occurred earlier, it should have been destroyed.
        if (actError) {
            should(list).have.length(1);
            should(ds.deployID).not.be.Undefined();
            should(list[0]).equal(ds.deployID);

        } else {
            should(list).have.length(0);
        }

        return ds;
    }

    async function createSuccess(stackNameOrOpts: string | DoCreate): Promise<DeploySuccess> {
        const opts = typeof stackNameOrOpts === "object" ?
            stackNameOrOpts : { stackName: stackNameOrOpts };
        const ds = await doCreate(opts);
        if (!isDeploySuccess(ds)) {
            throw new Error("Failure: " + messagesToString(ds.messages));
        }

        const list = await listDeploymentIDs(await server());
        should(list).have.length(1);
        should(list[0]).equal(ds.deployID);
        return ds;
    }

    async function createProject() {
        await fs.writeFile("index.tsx", simpleIndexTsx);
        await fs.writeFile("package.json",
            JSON.stringify(simplePackageJson, null, 2));
        await fs.outputFile(path.join("simple_plugin", "index.ts"), simplePluginTs);
        await fs.outputFile(path.join("simple_plugin", "package.json"), simplePluginPackageJson);

        await yarn.install(localRegistry.yarnProxyOpts);
    }

    it("Should build a single file", async () => {
        const ds = await createSuccess("default");

        should(ds.domXml).equal(defaultDomXmlOutput(["Simple"]));
        should(ds.stateJson).equal("{}");
        should(ds.deployID).match(/myproject::default-[a-z]{4}/);
        should(ds.mountedOrigStatus).eql({ status: "Here I am!" });

        const lstdout = client.stdout;
        should(lstdout).match(/EchoPlugin: start/);
        should(lstdout).match(/EchoPlugin: observe/);
        should(lstdout).match(/EchoPlugin: analyze/);
        should(lstdout).match(/action1/);
        should(lstdout).match(/action2/);
        should(lstdout).match(/EchoPlugin: finish/);
    });

    it("Should build stack that is a promise", async () => {
        const ds = await createSuccess("promises");

        should(ds.domXml).equal(defaultDomXmlOutput(["Simple"]));
        should(ds.stateJson).equal("{}");
        should(ds.deployID).match(/myproject::promises-[a-z]{4}/);

        const lstdout = client.stdout;
        should(lstdout).match(/EchoPlugin: start/);
        should(lstdout).match(/EchoPlugin: observe/);
        should(lstdout).match(/EchoPlugin: analyze/);
        should(lstdout).match(/action1/);
        should(lstdout).match(/action2/);
        should(lstdout).match(/EchoPlugin: finish/);
    });

    it("Should error on stack that has a rejected style promise", async () => {
        await createError("promises-err", [
            /Error creating deployment: Error: Error generated by stack style: makeErr/,
        ], []);
    });

    it("Should build stack that has a style function", async () => {
        const ds = await createSuccess("promise-func");

        should(ds.domXml).equal(defaultDomXmlOutput(["Simple"]));
        should(ds.stateJson).equal("{}");
        should(ds.deployID).match(/myproject::promise-func-[a-z]{4}/);

        const lstdout = client.stdout;
        should(lstdout).match(/EchoPlugin: start/);
        should(lstdout).match(/EchoPlugin: observe/);
        should(lstdout).match(/EchoPlugin: analyze/);
        should(lstdout).match(/action1/);
        should(lstdout).match(/action2/);
        should(lstdout).match(/EchoPlugin: finish/);
    });

    it("Should error on stack that has a style function error", async () => {
        await createError("promise-func-err", [
            /Error creating deployment: Error: Error generated by stack style: makeErr/,
        ], []);
    });

    it("Should build a single file with DeployID and error on existing DeployID", async () => {
        const deployID = "someID";
        const opts = {
            stackName: "default",
            deployID,
        };
        const ds = await createSuccess(opts);

        should(ds.domXml).equal(defaultDomXmlOutput(["Simple"]));
        should(ds.stateJson).equal("{}");
        should(ds.deployID).equal(deployID);
        should(ds.mountedOrigStatus).eql({ status: "Here I am!" });

        const lstdout = client.stdout;
        should(lstdout).match(/EchoPlugin: start/);
        should(lstdout).match(/EchoPlugin: observe/);
        should(lstdout).match(/EchoPlugin: analyze/);
        should(lstdout).match(/action1/);
        should(lstdout).match(/action2/);
        should(lstdout).match(/EchoPlugin: finish/);

        const ds2 = await doCreate(opts);
        if (isDeploySuccess(ds2)) {
            throw new Error("Second deployment should not have been created with same deployID");
        }

        checkMessages(ds2, [/Error creating deployment: DeployID 'someID' already exists/], MessageType.error);
    });

    it("Should log error on analyze", async () => {
        await createError("AnalyzeError", [
            /Error creating deployment: Error: AnalyzeError/
        ], []);
    });

    it("Should log error on action", async () => {
        await createError("ActError", [
            /Error: ActError[12]/,
            /Error: ActError[12]/,
            /Error while deploying Group: A dependency failed to deploy successfully/,
            /Error creating deployment: Errors encountered during plugin action phase/
        ], [], true);
    });

    it("Should report status", async function () {
        this.timeout(baseTimeout + opTimeout);
        const ds = await createSuccess("default");

        should(ds.domXml).equal(defaultDomXmlOutput(["Simple"]));
        should(ds.stateJson).equal("{}");
        should(ds.deployID).match(/myproject::default-[a-z]{4}/);
        should(ds.mountedOrigStatus).eql({ status: "Here I am!" });

        const dsStatus = await fetchStatus({
            adaptUrl,
            deployID: ds.deployID,
            fileName: "index.tsx",
            client,
        });

        if (!isDeploySuccess(dsStatus)) {
            throw new Error("Failure: " + messagesToString(dsStatus.messages));
        }

        should(dsStatus.domXml).equal(defaultDomXmlOutput(["Simple"]));
        should(dsStatus.stateJson).equal("{}");
        should(dsStatus.deployID).match(/myproject::default-[a-z]{4}/);
        should(dsStatus.mountedOrigStatus).eql({ status: "Here I am!" });
    });

    it("Should deploy and update a stack with null root", async function () {
        this.timeout(baseTimeout + opTimeout);
        const ds1 = await createSuccess("null");

        should(ds1.summary.error).equal(0);
        should(ds1.domXml).equal(`<Adapt/>\n`);

        should(ds1.stateJson).equal("{}");

        const lstdout = client.stdout;
        should(lstdout).match(/EchoPlugin: start/);
        should(lstdout).match(/EchoPlugin: observe/);
        should(lstdout).match(/EchoPlugin: analyze/);
        should(lstdout).not.match(/action1/);
        should(lstdout).not.match(/action2/);
        should(lstdout).match(/EchoPlugin: finish/);

        // Now update the deployment
        const ds2 = await updateDeployment({
            adaptUrl,
            deployID: ds1.deployID,
            fileName: "index.tsx",
            client,
            prevStateJson: "{}",
            stackName: "default",
        });
        if (!isDeploySuccess(ds2)) {
            should(isDeploySuccess(ds2)).be.True();
            return;
        }

        should(ds2.summary.error).equal(0);
        should(ds2.domXml).equal(defaultDomXmlOutput(["Simple"]));
        should(ds2.stateJson).equal("{}");
    });

    it("Should deploy a stack that builds to null", async () => {
        const ds1 = await createSuccess("BuildNull");

        should(ds1.summary.error).equal(0);
        should(ds1.domXml).equal(`<Adapt/>\n`);

        should(ds1.stateJson).equal("{}");

        const lstdout = client.stdout;
        should(lstdout).match(/EchoPlugin: start/);
        should(lstdout).match(/EchoPlugin: observe/);
        should(lstdout).match(/EchoPlugin: analyze/);
        should(lstdout).not.match(/action1/);
        should(lstdout).not.match(/action2/);
        should(lstdout).match(/EchoPlugin: finish/);

    });

    it("Should deploy and update a stack with observer", async function () {
        this.timeout(baseTimeout + opTimeout);
        const ds1 = await createSuccess("ObserverToSimple");

        should(ds1.summary.error).equal(0);
        should(ds1.domXml).equal(defaultDomXmlOutput(["ObserverToSimple", "ObserverToSimple-Observer", "Simple"]));

        let lstdout = client.stdout;
        should(lstdout).match(/Props: undefined null/);
        should(lstdout).match(/Props: {"mockById":{"idSquared":1}} null/);

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
            client,
            prevStateJson: "{}",
            stackName: "ObserverToSimple",
        });
        if (!isDeploySuccess(ds2)) {
            should(isDeploySuccess(ds2)).be.True();
            return;
        }

        should(ds2.summary.error).equal(0);
        should(ds2.domXml).equal(defaultDomXmlOutput(["ObserverToSimple", "ObserverToSimple-Observer", "Simple"]));

        lstdout = client.stdout;
        should(lstdout).not.match(/Props: undefined null/);
        should(lstdout).match(/Props: {"mockById":{"idSquared":1}} null/);

    });

    it("Should report queries that need data after observation pass", async () => {
        const ds1 = await createSuccess("NeverObserverToSimple");

        should(ds1.summary.error).equal(0);
        should(ds1.domXml).equal(defaultDomXmlOutput(["ObserverToSimple", "ObserverToSimple-Observer", "Simple"]));

        const lstdout = client.stdout;
        should(lstdout).match(/Props: undefined null/);

        should(ds1.needsData).eql({ neverObserve: [{ query: "{\n  mockById(id: \"1\") {\n    idSquared\n  }\n}\n" }] });

        should(lstdout).match(/EchoPlugin: start/);
        should(lstdout).match(/EchoPlugin: observe/);
        should(lstdout).match(/EchoPlugin: analyze/);
        should(lstdout).match(/action1/);
        should(lstdout).match(/action2/);
        should(lstdout).match(/EchoPlugin: finish/);
    });

    it("Should log build error", async () => {
        await createError("BuildError", [
            "Error creating deployment: Error building Adapt project"
        ], [
            "Component BuildError cannot be built with current props: SFC build failed: This is a build error"
        ]);
    });

    it("Should stop on delete error", async () => {
        const ds1 = await createSuccess("DeleteError");

        should(ds1.stateJson).equal("{}");
        should(ds1.deployID).match(/myproject::DeleteError-[a-z]{4}/);

        let lstdout = client.stdout;
        let lstderr = client.stderr;
        should(lstdout).match(/EchoPlugin: start/);
        should(lstdout).match(/EchoPlugin: observe/);
        should(lstdout).match(/EchoPlugin: analyze/);
        should(lstdout).match(/Doing echo action1/);
        should(lstdout).match(/Doing echo action2/);
        should(lstdout).match(/EchoPlugin: finish/);
        should(lstderr).equal("");

        // Now stop the deployment
        const ds2 = await updateDeployment({
            adaptUrl,
            deployID: ds1.deployID,
            fileName: "index.tsx",
            client,
            prevStateJson: "{}",
            stackName: "(null)",
        });
        lstdout = client.stdout;
        lstderr = client.stderr;

        // Should return an error
        if (isDeploySuccess(ds2)) throw should(isDeploySuccess(ds2)).be.False();
        should(ds2.summary.error).equal(4); // 3 components + 1 overall failure
        should(ds2.summary.warning).equal(0);

        // component2 depends on component1, so component 2 creates last but
        // deletes first.
        should(lstdout).match(/Doing echo delete2/);
        should(lstderr).match(/Error while echo delete2/);

        // Because component2 errors, we shouldn't even try to delete
        // component1.
        should(lstdout).not.match(/Doing echo delete1/);
        should(lstderr).not.match(/Error while echo delete1/);
    });

    it("Should continue on delete error with ignoreDeleteErrors", async () => {
        const ds1 = await createSuccess("DeleteError");

        // should(ds.domXml).equal(defaultDomXmlOutput(["Simple"]));
        should(ds1.stateJson).equal("{}");
        should(ds1.deployID).match(/myproject::DeleteError-[a-z]{4}/);

        let lstdout = client.stdout;
        let lstderr = client.stderr;
        should(lstdout).match(/EchoPlugin: start/);
        should(lstdout).match(/EchoPlugin: observe/);
        should(lstdout).match(/EchoPlugin: analyze/);
        should(lstdout).match(/Doing echo action1/);
        should(lstdout).match(/Doing echo action2/);
        should(lstdout).match(/EchoPlugin: finish/);
        should(lstderr).equal("");

        // Now stop the deployment, but ignore errors
        const ds2 = await updateDeployment({
            adaptUrl,
            deployID: ds1.deployID,
            fileName: "index.tsx",
            client,
            ignoreDeleteErrors: true,
            prevStateJson: "{}",
            stackName: "(null)",
        });
        lstdout = client.stdout;
        lstderr = client.stderr;

        // should return success
        if (!isDeploySuccess(ds2)) throw should(isDeploySuccess(ds2)).be.True();
        should(ds2.summary.error).equal(0);
        should(ds2.summary.warning).equal(2);

        // Both components should try to delete
        should(lstdout).match(/Doing echo delete1/);
        should(lstdout).match(/Doing echo delete2/);
        should(lstdout).match(/WARNING: --Error \(ignored\) while echo delete1/);
        should(lstdout).match(/WARNING: --Error \(ignored\) while echo delete2/);
        should(lstderr).equal("");
    });

    it("Should rehydrate primitive dependencies", async () => {
        const ds1 = await createSuccess("PrimDepends");

        should(ds1.stateJson).equal("{}");
        should(ds1.deployID).match(/myproject::PrimDepends-[a-z]{4}/);

        let lstdout = client.stdout;
        let lstderr = client.stderr;
        let actionLogs = grep(lstdout, "Doing");
        should(actionLogs).have.length(3);
        should(actionLogs[0]).match(/action1/);
        should(actionLogs[1]).match(/action3/);
        should(actionLogs[2]).match(/action2/);
        should(lstderr).equal("");

        // Now stop the deployment
        const ds2 = await updateDeployment({
            adaptUrl,
            deployID: ds1.deployID,
            fileName: "index.tsx",
            client,
            prevStateJson: "{}",
            stackName: "(null)",
        });
        lstdout = client.stdout;
        lstderr = client.stderr;

        if (!isDeploySuccess(ds2)) throw should(isDeploySuccess(ds2)).be.True();
        should(ds2.summary.error).equal(0);
        should(ds2.summary.warning).equal(0);

        actionLogs = grep(lstdout, "Doing");
        should(actionLogs).have.length(3);
        should(actionLogs[0]).match(/delete2/);
        should(actionLogs[1]).match(/delete3/);
        should(actionLogs[2]).match(/delete1/);
        should(lstderr).equal("");
    });

});
