import * as should from "should";
import * as sinon from "sinon";

import { Console } from "console";
import { WritableStreamBuffer } from "stream-buffers";
import Adapt, { Group, UnbsElement } from "../src";
import * as pluginSupport from "../src/plugin_support";

function nextTick(): Promise<void> {
    return new Promise((res) => process.nextTick(() => res()));
}

async function doAction(name: string, cb: (op: string) => void) {
    await nextTick();
    cb(name);
}

class TestPlugin implements pluginSupport.Plugin {
    constructor(readonly spy: sinon.SinonSpy) { }

    async start(options: pluginSupport.PluginOptions) {
        this.spy("start", options);
    }
    async observe(dom: UnbsElement) {
        this.spy("observe", dom);
    }
    analyze(dom: UnbsElement): pluginSupport.Action[] {
        this.spy("analyze", dom);
        return [
            { description: "action1", act: () => doAction("action1", this.spy) },
            { description: "action2", act: () => doAction("action2", this.spy) }
        ];
    }
    async finish() {
        this.spy("finish");
    }
}

describe("Plugin Support Basic Tests", () => {
    let mgr: pluginSupport.PluginManager;
    let spy: sinon.SinonSpy;
    let mockStdOut: WritableStreamBuffer;
    let mockStdErr: WritableStreamBuffer;
    let logger: (...args: any[]) => void;
    const dom = <Group />;

    beforeEach(() => {
        spy = sinon.spy();
        mockStdOut = new WritableStreamBuffer();
        mockStdErr = new WritableStreamBuffer();
        const c = new Console(mockStdOut, mockStdErr);
        logger = (...args: any[]) => c.log(...args);

        mgr = pluginSupport.createPluginManager({
            plugins: [new TestPlugin(spy)]
        });
    });

    it("Should construct a PluginManager", () => {
        should(mgr).not.Undefined();
    });

    it("Should call start on each plugin", async () => {
        await mgr.start(dom, { log: logger });
        should(spy.calledOnce).True();
        should(spy.args[0][0]).equal("start");
    });

    it("Should call observe after start", async () => {
        await mgr.start(dom, { log: logger });
        await mgr.observe();
        should(spy.callCount).equal(2);
        should(spy.getCall(0).args[0]).equal("start");
        should(spy.getCall(1).args).eql(["observe", dom]);
    });

    it("Should call analyze after observe", async () => {
        await mgr.start(dom, { log: logger });
        await mgr.observe();
        await mgr.analyze();
        should(spy.callCount).equal(3);
        should(spy.getCall(0).args[0]).equal("start");
        should(spy.getCall(1).args).eql(["observe", dom]);
        should(spy.getCall(2).args).eql(["analyze", dom]);
    });

    it("Should call actions", async () => {
        await mgr.start(dom, { log: logger });
        await mgr.observe();
        await mgr.analyze();
        await mgr.act(false);
        should(spy.callCount).equal(5);
        should(spy.getCall(0).args[0]).equal("start");
        should(spy.getCall(1).args).eql(["observe", dom]);
        should(spy.getCall(2).args).eql(["analyze", dom]);
        should(spy.getCall(3).args).eql(["action1"]);
        should(spy.getCall(4).args).eql(["action2"]);
        const contents = mockStdOut.getContentsAsString();
        should(contents).match(/action1/);
        should(contents).match(/action2/);
    });

    it("Should not call actions on dry run", async () => {
        await mgr.start(dom, { log: logger });
        await mgr.observe();
        await mgr.analyze();
        await mgr.act(true);
        should(spy.callCount).equal(3);
        should(spy.getCall(0).args[0]).equal("start");
        should(spy.getCall(1).args).eql(["observe", dom]);
        should(spy.getCall(2).args).eql(["analyze", dom]);
        const contents = mockStdOut.getContentsAsString();
        should(contents).match(/action1/);
        should(contents).match(/action2/);
    });

});
