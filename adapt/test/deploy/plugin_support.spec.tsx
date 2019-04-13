import {
    createTaskObserver,
    sleep,
    TaskObserver,
    TaskObserversUnknown,
    TaskState,
} from "@usys/utils";
import * as fs from "fs-extra";
import { last } from "lodash";
import * as path from "path";
import should from "should";
import * as sinon from "sinon";

import { createMockLogger, mochaTmpdir, MockLogger } from "@usys/testutils";
import Adapt, { AdaptElementOrNull, AdaptMountedElement, BuiltDomElement, Group } from "../../src";
import {
    Action,
    ActOptions,
    ChangeType,
    Plugin,
    PluginManager,
    PluginManagerStartOptions,
    PluginModule,
    PluginOptions,
} from "../../src/deploy";
import * as pluginSupport from "../../src/deploy/plugin_support";
import { MockAdaptContext, mockAdaptContext } from "../../src/ts";
import { createMockDeployment } from "../server/mocks";
import { doBuild, Empty, packageDirs } from "../testlib";

function nextTick(): Promise<void> {
    return new Promise((res) => process.nextTick(() => res()));
}

async function doAction(name: string, cb: (op: string) => void) {
    await nextTick();
    cb(name);
}

class TestPlugin implements Plugin<{}> {
    constructor(readonly spy: sinon.SinonSpy) { }

    async start(options: PluginOptions) {
        this.spy("start", options);
    }
    async observe(_oldDom: AdaptElementOrNull, dom: AdaptElementOrNull) {
        const obs = { test: "object" };
        this.spy("observe", dom, obs);
        return obs;
    }

    analyze(_oldDom: AdaptElementOrNull, dom: AdaptElementOrNull, obs: {}): Action[] {
        this.spy("analyze", dom, obs);
        if (dom == null) throw new Error(`null dom not handled`);
        const info = (i: number) => ({
            type: ChangeType.create,
            detail: `action${i}`,
            changes: [{
                type: ChangeType.create,
                element: dom.props.children[i - 1] as BuiltDomElement,
                detail: `action${i}`,
            }]
        });
        return [
            { act: () => doAction("action1", this.spy), ...info(1) },
            { act: () => doAction("action2", this.spy), ...info(2) },
        ];
    }
    async finish() {
        this.spy("finish");
    }
}

describe("Plugin Support Basic Tests", () => {
    let mgr: PluginManager;
    let spy: sinon.SinonSpy;
    let logger: MockLogger;
    let options: PluginManagerStartOptions;
    let dataDir: string;
    let taskObserver: TaskObserver;
    let dom: AdaptMountedElement;
    let kids: AdaptMountedElement[];
    let actOptions: ActOptions;
    const orig =
        <Group>
            <Empty id={0} />
            <Empty id={1} />
        </Group>;

    mochaTmpdir.all("adapt-plugin-tests");

    beforeEach(async () => {
        dom = (await doBuild(orig)).dom;
        kids = dom.props.children;
        spy = sinon.spy();
        logger = createMockLogger();
        taskObserver = createTaskObserver("parent", { logger });
        taskObserver.started();
        const registered = new Map<string, PluginModule>();
        registered.set("TestPlugin", {
            name: "TestPlugin",
            module,
            create: () => new TestPlugin(spy),
            packageName: "test_plugin",
            version: "1.0.0",
        });

        mgr = pluginSupport.createPluginManager(registered);
        dataDir = path.join(process.cwd(), "pluginData");
        options = {
            logger,
            deployment: await createMockDeployment({ deployID: "deploy123"}),
            dataDir,
        };
        actOptions = {
            sequence: await options.deployment.newSequence(),
            taskObserver,
        };
    });

    function getTasks(): TaskObserversUnknown {
        return (taskObserver.childGroup() as any).tasks_;
    }

    it("Should construct a PluginManager", () => {
        should(mgr).not.Undefined();
    });

    it("Should call start on each plugin", async () => {
        await mgr.start(null, dom, options);
        should(spy.calledOnce).True();
        should(spy.getCall(0).args[0]).eql("start");
        should(spy.getCall(0).args[1].deployID).eql("deploy123");
        should(spy.getCall(0).args[1].dataDir)
            .eql(path.join(dataDir, "test_plugin@1.0.0", "TestPlugin"));
    });

    it("Should create plugin data directory", async () => {
        await mgr.start(null, dom, options);
        should(spy.calledOnce).True();
        should(spy.getCall(0).args[0]).eql("start");
        const expected = path.join(dataDir, "test_plugin@1.0.0", "TestPlugin");
        should(spy.getCall(0).args[1].dataDir).equal(expected);
        should(fs.existsSync(expected)).be.True();
    });

    it("Should call observe after start", async () => {
        await mgr.start(null, dom, options);
        await mgr.observe();
        should(spy.callCount).equal(2);
        should(spy.getCall(0).args[0]).eql("start");
        should(spy.getCall(0).args[1].deployID).eql("deploy123");
        should(spy.getCall(1).args).eql(["observe", dom, { test: "object" }]);
    });

    it("Should call analyze after observe", async () => {
        await mgr.start(null, dom, options);
        await mgr.observe();
        mgr.analyze();
        should(spy.callCount).equal(3);
        should(spy.getCall(0).args[0]).eql("start");
        should(spy.getCall(0).args[1].deployID).eql("deploy123");
        should(spy.getCall(1).args).eql(["observe", dom, { test: "object" }]);
        should(spy.getCall(2).args).eql(["analyze", dom, { test: "object" }]);

        const tasks = getTasks();
        const taskNames = Object.keys(tasks);
        should(taskNames).have.length(0);
    });

    it("Should call actions", async () => {
        await mgr.start(null, dom, options);
        await mgr.observe();
        mgr.analyze();
        await mgr.act(actOptions);
        await mgr.finish();
        should(spy.callCount).equal(6);
        should(spy.getCall(0).args[0]).eql("start");
        should(spy.getCall(0).args[1].deployID).eql("deploy123");
        should(spy.getCall(1).args).eql(["observe", dom, { test: "object" }]);
        should(spy.getCall(2).args).eql(["analyze", dom, { test: "object" }]);
        // The two actions can be called in either order
        should([spy.getCall(3).args, spy.getCall(4).args])
            .containDeep([ ["action1"], ["action2"] ]);
        should(spy.getCall(5).args).eql(["finish"]);
        const contents = logger.stdout;
        should(contents).match(/action1/);
        should(contents).match(/action2/);

        const tasks = getTasks();
        const taskNames = Object.keys(tasks);
        should(taskNames)
            .containDeep([dom, ...kids].map((e) => e.id));
        should(taskNames.map((n) => tasks[n]!.description))
            .containDeep(["Group", "action1", "action2"]);
        should(taskNames.map((n) => tasks[n]!.state))
            .eql([TaskState.Complete, TaskState.Complete, TaskState.Complete]);
    });

    it("Should not call actions on dry run", async () => {
        await mgr.start(null, dom, options);
        await mgr.observe();
        mgr.analyze();
        await mgr.act({ ...actOptions, dryRun: true });
        await mgr.finish();
        should(spy.callCount).equal(4);
        should(spy.getCall(0).args[0]).eql("start");
        should(spy.getCall(0).args[1].deployID).eql("deploy123");
        should(spy.getCall(1).args).eql(["observe", dom, { test: "object" }]);
        should(spy.getCall(2).args).eql(["analyze", dom, { test: "object" }]);
        should(spy.getCall(3).args).eql(["finish"]);
        const contents = logger.stdout;
        should(contents).match(/action1/);
        should(contents).match(/action2/);

        const tasks = getTasks();
        const taskNames = Object.keys(tasks);
        should(taskNames)
            .containDeep([dom, ...kids].map((e) => e.id));
        should(taskNames.map((n) => tasks[n]!.description))
            .containDeep(["Group", "action1", "action2"]);
        should(taskNames.map((n) => tasks[n]!.state))
            .eql([TaskState.Skipped, TaskState.Skipped, TaskState.Skipped]);
    });

    it("Should not allow illegal call sequences", async () => {
        await mgr.start(null, dom, options);
        should(() => mgr.analyze()).throw();
        await should(mgr.act(actOptions)).rejectedWith(Error);
        await should(mgr.finish()).rejectedWith(Error);

        await mgr.observe();
        await should(mgr.act(actOptions)).rejectedWith(Error);
        await should(mgr.finish()).rejectedWith(Error);

        mgr.analyze();
        await mgr.act({ ...actOptions, dryRun: true });
        taskObserver.complete();
        await should(mgr.act(actOptions)).rejectedWith(/new TaskObserver must be provided/);

        taskObserver = createTaskObserver("parent2", { logger });
        taskObserver.started();
        actOptions.taskObserver = taskObserver;
        await mgr.act(actOptions);
        await mgr.finish();
    });

    it("Should allow finish without acting", async () => {
        await mgr.start(null, dom, options);
        await mgr.observe();
        mgr.analyze();
        await mgr.finish();
    });

    it("Should run actions after dry run", async () => {
        await mgr.start(null, dom, options);
        await mgr.observe();
        mgr.analyze();
        await mgr.act({ ...actOptions, dryRun: true });
        should(spy.callCount).equal(3);
        should(spy.getCall(0).args[0]).eql("start");
        should(spy.getCall(0).args[1].deployID).eql("deploy123");
        should(spy.getCall(1).args).eql(["observe", dom, { test: "object" }]);
        should(spy.getCall(2).args).eql(["analyze", dom, { test: "object" }]);
        const contents = logger.stdout;
        should(contents).match(/action1/);
        should(contents).match(/action2/);

        const tasks = getTasks();
        let taskNames = Object.keys(tasks);
        should(taskNames)
            .containDeep([dom, ...kids].map((e) => e.id));
        should(taskNames.map((n) => tasks[n]!.description))
            .containDeep(["Group", "action1", "action2"]);
        should(taskNames.map((n) => tasks[n]!.state))
            .eql([TaskState.Skipped, TaskState.Skipped, TaskState.Skipped]);

        // Provide a new taskObserver for the second act()
        taskObserver = createTaskObserver("parent2", { logger });
        taskObserver.started();
        actOptions.taskObserver = taskObserver;
        await mgr.act(actOptions);
        await mgr.finish();

        should(spy.callCount).equal(6);
        // The two actions can be called in either order
        should([spy.getCall(3).args, spy.getCall(4).args])
            .containDeep([ ["action1"], ["action2"] ]);
        should(spy.getCall(5).args).eql(["finish"]);

        const newTasks = getTasks();
        should(newTasks).not.equal(tasks);
        taskNames = Object.keys(newTasks);
        should(taskNames)
            .containDeep([dom, ...kids].map((e) => e.id));
        should(taskNames.map((n) => newTasks[n]!.description))
            .containDeep(["Group", "action1", "action2"]);
        should(taskNames.map((n) => newTasks[n]!.state))
            .eql([TaskState.Complete, TaskState.Complete, TaskState.Complete]);
    });

});

class Concurrent {
    concurrent = 0;
    maxConcurrent = 0;

    inc() {
        if (++this.concurrent > this.maxConcurrent) this.maxConcurrent = this.concurrent;
    }
    dec() {
        --this.concurrent;
    }
}

class SlowPlugin implements Plugin<{}> {
    local = new Concurrent();

    constructor(
        public seriesActions: boolean,
        readonly spy: sinon.SinonSpy,
        public shared: Concurrent,
        ) { }

    async start(options: PluginOptions) {/**/}
    async observe(_oldDom: AdaptElementOrNull, dom: AdaptElementOrNull) {
        return {};
    }
    act = async () => {
        this.local.inc();
        this.shared.inc();

        await sleep(20);

        this.local.dec();
        this.shared.dec();
    }
    analyze(_oldDom: AdaptElementOrNull, dom: AdaptElementOrNull, _obs: {}): Action[] {
        const info = {
            type: ChangeType.create,
            detail: "action detail",
            changes: [{
                type: ChangeType.create,
                element: dom as BuiltDomElement,
                detail: "change detail"
            }]
        };
        return [
            { ...info, act: this.act },
            { ...info, act: this.act },
            { ...info, act: this.act },
        ];
    }
    async finish() {
        this.spy("max", this.local.maxConcurrent);
    }
}

describe("Plugin concurrency", () => {
    let mgr: PluginManager;
    let logger: MockLogger;
    let options: PluginManagerStartOptions;
    let dataDir: string;
    let registered: Map<string, PluginModule>;
    let shared: Concurrent;
    let dom: AdaptMountedElement;
    let actOptions: ActOptions;
    const orig = <Group />;

    mochaTmpdir.all("adapt-plugin-tests");

    beforeEach(async () => {
        dom = (await doBuild(orig)).dom;
        logger = createMockLogger();
        registered = new Map<string, PluginModule>();
        shared = new Concurrent();

        dataDir = path.join(process.cwd(), "pluginData");
        options = {
            logger,
            deployment: await createMockDeployment({ deployID: "deploy123"}),
            dataDir,
        };
        actOptions = {
            sequence: await options.deployment.newSequence(),
            taskObserver: createTaskObserver("parent", { logger }),
        };
        actOptions.taskObserver.started();
    });

    it("Should act in parallel", async () => {
        const spy = sinon.spy();
        registered.set("SlowPlugin", {
            name: "SlowPlugin",
            module,
            create: () => new SlowPlugin(false, spy, shared),
            packageName: "slow_plugin",
            version: "1.0.0",
        });
        mgr = pluginSupport.createPluginManager(registered);

        await mgr.start(null, dom, options);
        await mgr.observe();
        mgr.analyze();
        await mgr.act(actOptions);
        await mgr.finish();
        should(spy.callCount).equal(1);
        should(spy.getCall(0).args[0]).eql("max");
        should(spy.getCall(0).args[1]).eql(3);
    });

    it("Should act in series", async () => {
        const spy = sinon.spy();
        registered.set("SlowPlugin", {
            name: "SlowPlugin",
            module,
            create: () => new SlowPlugin(true, spy, shared),
            packageName: "slow_plugin",
            version: "1.0.0",
        });
        mgr = pluginSupport.createPluginManager(registered);

        await mgr.start(null, dom, options);
        await mgr.observe();
        mgr.analyze();
        await mgr.act(actOptions);
        await mgr.finish();
        should(spy.callCount).equal(1);
        should(spy.getCall(0).args[0]).eql("max");
        should(spy.getCall(0).args[1]).eql(1);
    });

    it("Should act in series and parallel", async () => {
        const spies = [
            sinon.spy(),
            sinon.spy(),
            sinon.spy(),
        ];
        registered.set("Series1", {
            name: "Series1",
            module,
            create: () => new SlowPlugin(true, spies[0], shared),
            packageName: "slow_plugin",
            version: "1.0.0",
        });
        registered.set("Series2", {
            name: "Series2",
            module,
            create: () => new SlowPlugin(true, spies[1], shared),
            packageName: "slow_plugin",
            version: "1.0.0",
        });
        registered.set("Parallel", {
            name: "Parallel",
            module,
            create: () => new SlowPlugin(false, spies[2], shared),
            packageName: "slow_plugin",
            version: "1.0.0",
        });
        mgr = pluginSupport.createPluginManager(registered);

        await mgr.start(null, dom, options);
        await mgr.observe();
        mgr.analyze();
        await mgr.act(actOptions);
        await mgr.finish();
        spies.forEach((spy) => {
            should(spy.callCount).equal(1);
            should(spy.getCall(0).args[0]).eql("max");
        });
        should(spies[0].getCall(0).args[1]).eql(1);
        should(spies[1].getCall(0).args[1]).eql(1);
        should(spies[2].getCall(0).args[1]).eql(3);
        should(shared.maxConcurrent).eql(5);
    });
});

let testPluginsLoaded: string[] = [];

function testPluginSrcDir(name: string) {
    return path.join(packageDirs.root, "test_plugins", name);
}

async function setupTestPlugin(name: string) {
    const srcDir = testPluginSrcDir(name);
    const modDir = path.join(packageDirs.dist, "test_plugins", name);
    await fs.ensureSymlink(
        path.join(srcDir, "package.json"), path.join(modDir, "package.json"));
    return modDir;
}

async function requireTestPlugin(name: string, jsFile = "index.js") {
    const modDir = await setupTestPlugin(name);
    const jsPath = path.resolve(path.join(modDir, jsFile));
    await require(jsPath);
    testPluginsLoaded.push(jsPath);
}

function cleanupTestPlugins() {
    for (const p of testPluginsLoaded) {
        delete require.cache[p];
    }
    testPluginsLoaded = [];
}

function outputLines(logger: MockLogger): string[] {
    const stdout = logger.stdout;
    const lines = stdout.split("\n");
    const l = last(lines);
    if (l === "") lines.pop();
    return lines;
}

describe("Plugin register and deploy", () => {
    let logger: MockLogger;
    let mockContext: MockAdaptContext;
    let options: PluginManagerStartOptions;
    const dom = <Group />;

    beforeEach(async () => {
        cleanupTestPlugins();
        mockContext = mockAdaptContext();
        logger = createMockLogger();
        options = {
            logger,
            deployment: await createMockDeployment({ deployID: "deploy123"}),
            dataDir: "/tmp/fakeDataDir",
        };
    });
    afterEach(() => {
        mockContext.stop();
    });

    after(() => {
        cleanupTestPlugins();
    });

    it("Should register plugin", async () => {
        await requireTestPlugin("echo_plugin");
        should(mockContext.pluginModules).size(1);

        const mgr = pluginSupport.createPluginManager(mockContext.pluginModules);
        await mgr.start(null, dom, options);
        const lines = outputLines(logger);
        should(lines).have.length(1);
        should(lines[0]).match(/EchoPlugin: start/);
    });

    it("Should error if no plugins registered", () => {
        should(() => pluginSupport.createPluginConfig(mockContext.pluginModules))
            .throw(/No plugins registered/);
    });

    it("Should throw on registering same name, different create", async () => {
        await requireTestPlugin("echo_plugin");
        return should(requireTestPlugin("echo_plugin", "error.js"))
            .be.rejectedWith(
                /Attempt to register two plugins with the same name from the same package: echo \[echo_plugin@1.0.0]/);
    });

    it("Should register two plugins from same package", async () => {
        await requireTestPlugin("echo_plugin");
        await requireTestPlugin("echo_plugin", "second.js");
        should(mockContext.pluginModules).size(2);

        const mgr = pluginSupport.createPluginManager(mockContext.pluginModules);
        await mgr.start(null, dom, options);

        const lines = outputLines(logger);
        should(lines).have.length(2);
        should(lines[0]).match(/EchoPlugin: start/);
        should(lines[1]).match(/EchoPlugin: start/);
    });

    it("Should ignore second registration with same info", async () => {
        await requireTestPlugin("echo_plugin");
        await requireTestPlugin("echo_plugin", "duplicate.js");
        should(mockContext.pluginModules).size(1);

        const mgr = pluginSupport.createPluginManager(mockContext.pluginModules);
        await mgr.start(null, dom, options);

        const lines = outputLines(logger);
        should(lines).have.length(1);
        should(lines[0]).match(/EchoPlugin: start/);
    });
});
