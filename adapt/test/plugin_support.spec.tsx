import * as should from "should";

import { UnbsElement } from "../src";
import * as pluginSupport from "../src/plugin_support";

class TestPlugin implements pluginSupport.Plugin {
    async start(options: pluginSupport.PluginOptions) { }
    async observe(dom: UnbsElement) { }
    analyze(dom: UnbsElement): pluginSupport.Action[] { return []; }
    async finish() { }
}

describe("Plugin Support Basic Tests", () => {
    let mgr: pluginSupport.PluginManager;

    beforeEach(() => {
        mgr = pluginSupport.createPluginManager({
            plugins: [new TestPlugin()]
        });
    });

    it("Should construct a PluginManager", () => {
        should(mgr).not.Undefined();
    });

});
