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

import { mochaTmpdir } from "@adpt/testutils";
import { MaybePromise } from "@adpt/utils";
import should from "should";
import Adapt, {
    AdaptMountedElement,
    AdaptMountedPrimitiveElement,
    childrenToArray,
    DependsOnMethod,
    DeployHelpers,
    GoalStatus,
    Group,
    Handle,
    handle,
    isMountedPrimitiveElement,
    RelationExt,
    waiting,
    WithChildren,
} from "../src";
import { ExecutionPlanImpl, isExecutionPlanImpl } from "../src/deploy/execution_plan";
import { relatedHandles } from "../src/deploy/relation_utils";
import { dependencies } from "./deploy/common";
import { createBasicTestPlugin, DeployOptions, MockDeploy } from "./testlib";

interface PrimProps extends WithChildren {
    id: number;
    deployed?: () => boolean;
    action?: () => MaybePromise<void>;
    dependsOn?: DependsOnMethod;
}
interface PrimState {
    acted: boolean;
    done?: boolean;
}

class Prim extends Adapt.PrimitiveComponent<PrimProps, PrimState> {
    action?: PrimProps["action"];

    constructor(props: PrimProps) {
        super(props);
        if (!this.state.acted && props.action) {
            this.action = async () => {
                this.setState({ acted: true });
                return props.action && props.action();
            };
        }
        if (props.dependsOn) this.dependsOn = props.dependsOn;

        const deployed = props.deployed;
        if (deployed) {
            this.deployedWhen = (goalStatus: GoalStatus, helpers: DeployHelpers) => {
                // The reason we need this state is a little stupid. We want the deploy
                // execute() function to return after we deploy one (more) Prim
                // component, so we can check to see that ONLY one deployed. But
                // execute() doesn't exit unless there's a state change (so it can
                // do a rebuild).
                this.setState({ done: deployed() });

                return deployed() ? true : waiting("Not ready");
            };
        }
    }

    initialState() { return { acted: false }; }
}

// function ToPrim(props: SFCDeclProps<PrimProps>) {
//     const { handle: _h, ...rest } = props;
//     return <Prim {...rest} />;
// }

function getDependsOn(plan: ExecutionPlanImpl, el: AdaptMountedElement,
    gs = GoalStatus.Deployed): RelationExt | undefined {
    return el.dependsOn(gs, plan.helpers.create(el));
}

function getElements(root: AdaptMountedPrimitiveElement) {
    const kids = childrenToArray(root.props.children)
        .filter(isMountedPrimitiveElement);
    return [ root, ...kids ];
}

function makeDependsOn(deps: Handle | Handle[]): DependsOnMethod {
    return (_gs, helpers) => helpers.dependsOn(deps);
}

function extractTargetHandles(rel: RelationExt) {
    return relatedHandles(rel).map((h) => {
        const el = h.target;
        if (el == null) throw should(el).be.ok();
        return el.props.handle;
    });
}

describe("Component deploy tests", () => {
    let deploy: MockDeploy;
    let deployPass = 0;
    const deployedFn = (id: number) => () => {
        return id <= deployPass;
    };
    let actionsDone: number[] = [];
    const actionFn = (id: number) => () => { actionsDone.push(id); };

    const deployOpts: DeployOptions = {
        once: true,
        pollDelayMs: 0,
    };

    mochaTmpdir.all("adapt-jsx-tests");

    beforeEach(async () => {
        deploy = new MockDeploy({
            pluginCreates: [ createBasicTestPlugin ],
            tmpDir: process.cwd(),
        });
        await deploy.init();
        actionsDone = [];
    });

    it("Should dependsOn default to no dependencies", async () => {
        const root =
            <Group>
                <Prim key="1" id={1} />
                <Prim key="2" id={2} />
            </Group>;
        const { dom, plan } = await deploy.getExecutionPlan(root);
        if (dom == null) throw should(dom).be.ok();
        if (!isExecutionPlanImpl(plan)) throw new Error(`Not ExecutionPlanImpl`);

        const els = getElements(dom);
        should(els).have.length(3);

        should(getDependsOn(plan, els[0])).be.Undefined();
        should(getDependsOn(plan, els[1])).be.Undefined();
        should(getDependsOn(plan, els[2])).be.Undefined();
    });

    it("Should dependsOn call instance methods", async () => {
        const [ h2 ] = [ handle() ];
        const root =
            <Group key="root">
                <Prim key="1" id={1} dependsOn={makeDependsOn(h2)} />
                <Prim key="2" id={2} handle={h2} />
            </Group>;
        const { dom, plan } = await deploy.getExecutionPlan(root);
        if (dom == null) throw should(dom).be.ok();
        if (!isExecutionPlanImpl(plan)) throw new Error(`Not ExecutionPlanImpl`);

        const els = getElements(dom);
        should(els).have.length(3);

        const deps = els.map((el) => getDependsOn(plan, el));
        should(deps[0]).be.Undefined();
        should(deps[2]).be.Undefined();

        const d1 = deps[1];
        if (d1 == null) throw should(d1).be.ok();
        // Check that it returned a single Edge
        should(d1.description).equal('Edge( ["root","1"], ["root","2"] )');
        should(extractTargetHandles(d1)).eql([ els[2].props.handle ]);

        should(dependencies(plan, { key: "id" })).eql({
            '["root"]': [],
            '["root","1"]': [ '["root","2"]' ],
            '["root","2"]': [],
        });
    });

    it("Should dependsOn return additional dependencies", async () => {
        const [ h2 ] = [ handle() ];
        const root =
            <Group key="root">
                <Prim key="1" id={1} />
                <Prim key="2" id={2} handle={h2} />
            </Group>;
        const { dom, plan } = await deploy.getExecutionPlan(root);
        if (dom == null) throw should(dom).be.ok();
        if (!isExecutionPlanImpl(plan)) throw new Error(`Not ExecutionPlanImpl`);

        const els = getElements(dom);
        should(els).have.length(3);

        els[1].addDependency(h2);
        plan.updateElemWaitInfo(true);

        const deps = els.map((el) => getDependsOn(plan, el));
        should(deps[0]).be.Undefined();
        should(deps[2]).be.Undefined();

        const d1 = deps[1];
        if (d1 == null) throw should(d1).be.ok();
        should(d1.description).equal('Edge( ["root","1"], ["root","2"] )');
        should(extractTargetHandles(d1)).eql([ els[2].props.handle ]);

        should(dependencies(plan, { key: "id" })).eql({
            '["root"]': [],
            '["root","1"]': [ '["root","2"]' ],
            '["root","2"]': [],
        });
    });

    it("Should dependsOn combine dependencies", async () => {
        const [ h2, h3 ] = [ handle(), handle() ];
        const root =
            <Group key="root">
                <Prim key="1" id={1} dependsOn={makeDependsOn(h2)} />
                <Prim key="2" id={2} handle={h2} />
                <Prim key="3" id={3} handle={h3} />
            </Group>;
        const { dom, plan } = await deploy.getExecutionPlan(root);
        if (dom == null) throw should(dom).be.ok();
        if (!isExecutionPlanImpl(plan)) throw new Error(`Not ExecutionPlanImpl`);

        const els = getElements(dom);
        should(els).have.length(4);

        els[1].addDependency(h3);
        plan.updateElemWaitInfo(true);

        const deps = els.map((el) => getDependsOn(plan, el));
        should(deps[0]).be.Undefined();
        should(deps[2]).be.Undefined();
        should(deps[3]).be.Undefined();

        const d1 = deps[1];
        if (d1 == null) throw should(d1).be.ok();
        should(d1.description).equal("And");
        should(extractTargetHandles(d1)).eql([
            els[2].props.handle,
            els[3].props.handle
        ]);

        should(dependencies(plan, { key: "id" })).eql({
            '["root"]': [],
            '["root","1"]': [ '["root","2"]', '["root","3"]' ],
            '["root","2"]': [],
            '["root","3"]': [],
        });
    });

    it("Should deployedWhen wait for children", async () => {
        const actionsExpected = [
            // 1 and 3 have no dependencies, but 3's deployedWhen isn't ready
            // until pass 1
            [ 1, 3 ],
            // 3 completes, so 2's action fires, but 2's deployedWhen isn't ready
            [ 2 ],
            // 2's deployedWhen completes, so now all of 1's children are complete
            // allowing 0's action.
            [ 0 ],
        ];
        const maxPass = actionsExpected.length - 1;

        for (deployPass = 0; deployPass <= maxPass; deployPass++) {
            actionsDone = [];
            const [ h1, h3 ] = [ handle(), handle() ];
            const root =
                <Group>
                    <Prim key="0" id={0} action={actionFn(0)} dependsOn={makeDependsOn(h1)} />
                    <Prim key="1" id={1} handle={h1} action={actionFn(1)} >
                        <Prim key="2" id={2} deployed={deployedFn(2)}
                            action={actionFn(2)} dependsOn={makeDependsOn(h3)} />
                        <Prim key="3" id={3} handle={h3} deployed={deployedFn(1)}
                            action={actionFn(3)} />
                    </Prim>
                </Group>;
            const { deployComplete } = await deploy.deploy(root, deployOpts);
            // Complete only on final pass
            should(deployComplete).equal(deployPass === maxPass,
                `deployComplete=${deployComplete} deployPass=${deployPass}`);

            should(actionsDone).eql(actionsExpected[deployPass]);
        }
    });
});
