/*
 * Copyright 2018-2019 Unbounded Systems, LLC
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

import { Action, ChangeType, FinalDomElement, Plugin, PluginOptions, registerPlugin } from "../../src";

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
                        element: dom as FinalDomElement,
                        detail: "echo action1 Change"
                }]
            },
            {
                act: () => this.doAction("action2"),
                type: ChangeType.create,
                detail: "echo action2 Action",
                changes: [{
                        type: ChangeType.create,
                        element: dom as FinalDomElement,
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
