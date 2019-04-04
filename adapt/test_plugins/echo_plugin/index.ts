import { Action, BuiltDomElement, ChangeType, Plugin, PluginOptions, registerPlugin } from "../../src";

export class EchoPlugin implements Plugin<{}> {
    log_?: PluginOptions["log"];

    log(...args: any[]) {
        if (this.log_ == null) throw new Error(`Plugin has no log function`);
        this.log_(`${this.constructor.name}:`, ...args);
    }

    async start(options: PluginOptions) {
        if (options.log == null) throw new Error(`Plugin start called without log`);
        this.log_ = options.log;
        this.log("start");
    }
    async observe(_oldDom: any, dom: any) {
        this.log("observe", dom);
        return {};
    }
    analyze(_oldDom: any, dom: any, _obs: {}): Action[] {
        this.log("analyze", dom);
        return [
            {
                act: () => this.doAction("action1"),
                type: ChangeType.create,
                detail: "echo action1 Action",
                changes: [{
                        type: ChangeType.create,
                        element: dom as BuiltDomElement,
                        detail: "echo action1 Change"
                }]
            },
            {
                act: () => this.doAction("action2"),
                type: ChangeType.create,
                detail: "echo action2 Action",
                changes: [{
                        type: ChangeType.create,
                        element: dom as BuiltDomElement,
                        detail: "echo action2 Change"
                }]
            },
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
