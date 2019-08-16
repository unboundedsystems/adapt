/*
 * Copyright 2019 Unbounded Systems, LLC
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

import Adapt, { ChangeType, Group, PluginOptions } from "@adpt/core";
import { createMockLogger, MockLogger } from "@adpt/testutils";
import should from "should";
import { Action, ActionContext } from "../../src/action";
import { ActionPlugin, idFunc } from "../../src/action/action_plugin";
import { act, doBuild } from "../testlib";

class ActionGetId extends Action<{}, {}> {
    shouldAct(_: unknown, context: ActionContext) {
        return { act: true, detail: `${context.buildData.id}` };
    }

    action(_: unknown, context: ActionContext) {
        context.logger.info(context.buildData.id);
    }
}

describe("Action component", () => {
    let plugin: ActionPlugin;
    let options: PluginOptions;
    let logger: MockLogger;
    const deployID = "action123";

    beforeEach(() => {
        plugin = new ActionPlugin();
        logger = createMockLogger();
        options = {
            deployID,
            log: logger.info,
            logger,
            dataDir: "/fake/datadir",
        };
    });

    async function dom1() {
        const orig =
            <Group>
                <ActionGetId />
                <ActionGetId />
            </Group>;
        const { dom } = await doBuild(orig, { deployID });
        return dom;
    }

    it("Should have unique id in buildData", async () => {
        const dom = await dom1();

        await plugin.start(options);
        const obs = await plugin.observe(null, dom);
        const refObs = {
            [idFunc(dom.props.children[0])]: {
                type: ChangeType.create,
                detail: `${dom.props.children[0].id}`
            },
            [idFunc(dom.props.children[1])]: {
                type: ChangeType.create,
                detail: `${dom.props.children[1].id}`
            }
        };
        should(obs).eql(refObs);

        const actions = plugin.analyze(null, dom, obs);
        const noFunc = actions.map(({ act: _a, ...rest }) => rest);
        const refActions = [
            {
                type: ChangeType.create,
                detail: `${dom.props.children[0].id}`,
                changes: [{
                    type: ChangeType.create,
                    detail: `${dom.props.children[0].id}`,
                    element: dom.props.children[0]
                }]
            },
            {
                type: ChangeType.create,
                detail: `${dom.props.children[1].id}`,
                changes: [{
                    type: ChangeType.create,
                    detail: `${dom.props.children[1].id}`,
                    element: dom.props.children[1]
                }]
            }
        ];
        should(noFunc).eql(refActions);

        await act(actions);
        should(logger.stderr).equal("");
        should(logger.stdout).equal(`INFO: ${dom.props.children[0].id}\nINFO: ${dom.props.children[1].id}\n`);
    });
});
