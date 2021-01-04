/*
 * Copyright 2019-2020 Unbounded Systems, LLC
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

// tslint:disable: variable-name

import { createMockLogger, mochaTmpdir, MockLogger } from "@adpt/testutils";
import {
    createTaskObserver,
    inDebugger,
    Omit,
    sleep,
    TaskObserver,
    TaskObserversUnknown,
    TaskState,
} from "@adpt/utils";
import { uniq } from "lodash";
import pDefer from "p-defer";
import should from "should";
import sinon, { SinonSpy } from "sinon";

import Adapt, {
    Action,
    AdaptElement,
    AdaptMountedElement,
    ChangeType,
    DeployStatus,
    FinalDomElement,
    Group,
    handle,
    Handle,
    isFinalDomElement,
    isPrimitiveElement,
    serializeDom,
    useDependsOn,
    WithChildren,
} from "../../src/";
import {
    Dependency,
    DependsOn,
    DependsOnMethod,
    DeployHelpers,
    DeployOpStatus,
    EPPrimitiveDependencies,
    ExecuteComplete,
    ExecuteOptions,
    ExecutionPlanOptions,
    GoalStatus,
    WaitStatus,
} from "../../src/deploy/deploy_types";
import {
    createExecutionPlan,
    DependencyType,
    execute,
    ExecutionPlanImpl,
    ExecutionPlanImplOptions,
    isExecutionPlanImpl,
} from "../../src/deploy/execution_plan";
import { relationIsReadyStatus, toRelation } from "../../src/deploy/relation_utils";
import { And } from "../../src/deploy/relations";
import { shouldTrackStatus } from "../../src/deploy/status_tracker";
import { noStateUpdates } from "../../src/dom";
import { domDiff, domDiffElements, domMap } from "../../src/dom_utils";
import { InternalError } from "../../src/error";
import { reanimateDom } from "../../src/internal";
import { Deployment } from "../../src/server/deployment";
import { DeployOpID, DeployStepID, ElementStatusMap } from "../../src/server/deployment_data";
import { createMockDeployment, DeployOptions, doBuild, Empty, MockDeploy } from "../testlib";
import { ActionState, ActionStateState, createActionStatePlugin } from "./action_state";
import {
    dependencies,
    DependPrim,
    MakeDependPrim,
    makeHandles,
    MakePrim,
    Prim,
    spyArgs,
    toChangeType,
    toDiff,
} from "./common";

const timeoutMs = inDebugger() ? 0 : 1500;

interface AllOfTesterOptions {
    description: string;
    helpers: DeployHelpers;
    deps: Dependency[];
    checkReady?: (stat: WaitStatus) => void;
}

function AllOfTester(options: AllOfTesterOptions): DependsOn {
    const { description, helpers, deps, checkReady } = options;
    return {
        description,
        relatesTo: deps.map((d) => toRelation(helpers, d)),
        ready: (rels) => {
            const stat = relationIsReadyStatus(And(...rels));
            if (checkReady) checkReady(stat);
            return stat;
        }
    };
}

function makeAllOf(description: string, helpers: DeployHelpers, deps: Dependency[]) {
    return AllOfTester({ description, helpers, deps });
}

/**
 * A functional component that has dependencies and builds to a Group
 * with two MakePrim children.
 */
function Func({ key, dep }: { key: string; dep?: Handle }) {
    useDependsOn((_goal, h) => dep && h.dependsOn(dep));
    return (
        <Group key={key + "Group"}>
            <MakePrim key={key + "1"} id={1} />
            <MakePrim key={key + "2"} id={2} />
        </Group>
    );
}

describe("Execution plan", () => {
    let deployment: Deployment;
    let deployOpID: DeployOpID;
    let planOpts: Omit<ExecutionPlanOptions, "diff" | "goalStatus" | "newDom">;

    beforeEach(async () => {
        deployment = await createMockDeployment();
        deployOpID = await deployment.newOpID();
        planOpts = {
            actions: [],
            dependencies: {},
            deployment,
            deployOpID,
        };
    });

    it("Should create a plan", async () => {
        const d = <Empty id={1}/>;
        const { dom, mountedElements } = await doBuild(d);
        const plan = createExecutionPlan({
            ...planOpts,
            diff: domDiffElements([], mountedElements),
            goalStatus: DeployStatus.Deployed,
            newDom: dom,
        });
        should(plan).not.be.Null();

        if (!(plan instanceof ExecutionPlanImpl)) {
            throw new Error(`plan is not an ExecutionPlanImpl`);
        }
        should(plan.elems).have.length(1);
        should(plan.leaves).have.length(1);
        should(plan.nodes).have.length(1);
    });
});

type ActionCheck = (idx: number) => Promise<void>;
interface SequentialActsChecks {
    initial?: ActionCheck;
    allStarted?: ActionCheck;
    complete?: ActionCheck;
}

function sequentialActs(order: number[], spy: sinon.SinonSpy,
    checks: SequentialActsChecks = {}) {

    let toStart = order.length;
    const allStarted = pDefer<void>();
    const defList = order.map(() => pDefer<void>());
    const start = order.shift();
    if (start === undefined) throw new Error(`order must have length > 0`);

    return defList.map((d, i) => {
        const act = async () => {
            try {
                spy(`Action${i} started`);
                if (checks.initial) await checks.initial(i);

                // Wait for all actions to get initiated
                if (--toStart > 0) await allStarted.promise;
                else allStarted.resolve();

                if (checks.allStarted) await checks.allStarted(i);

                // Action with index === start doesn't wait.
                if (i !== start) await d.promise;
                spy(`Action${i} completed`);
                if (checks.complete) await checks.complete(i);

                // Resolve next on the list
                const next = order.shift();
                if (next !== undefined) defList[next].resolve();
            } catch (err) {
                err = new Error(`Action${i} failed: ${err}`);
                allStarted.reject(err);
                defList.forEach((p) => p.reject(err));
                throw err;
            }
        };
        return { deferred: d, act };
    });
}

function checkElemStatus(
    elStat: ElementStatusMap, el: AdaptMountedElement, expected: DeployStatus,
    errorMatch?: RegExp) {
    should(elStat[el.id].deployStatus).equal(expected);
    if (errorMatch != null) should(elStat[el.id].error).match(errorMatch);
}

describe("ExecutionPlanImpl", () => {
    let deployment: Deployment;
    let logger: MockLogger;
    let taskObserver: TaskObserver;
    const processStateUpdates = noStateUpdates;
    let executeOpts: Omit<ExecuteOptions, "plan">;
    let deployID: string;
    let deployOpID: DeployOpID;
    let planOpts: Omit<ExecutionPlanOptions, "diff" | "goalStatus" | "newDom">;
    let implOpts: Omit<ExecutionPlanImplOptions, "goalStatus">;
    const dependOpts = { key: "id" as const, removeEmpty: true };

    beforeEach(async () => {
        deployment = await createMockDeployment();
        deployID = deployment.deployID;
        deployOpID = await deployment.newOpID();
        implOpts = {
            deployment,
            deployOpID,
        };
        planOpts = {
            ...implOpts,
            actions: [],
            dependencies: {},
        };
        logger = createMockLogger();
        taskObserver = createTaskObserver("parent", { logger });
        executeOpts = {
            logger,
            processStateUpdates,
            taskObserver,
            timeoutMs,
        };
    });

    function getTasks(): TaskObserversUnknown {
        return (taskObserver.childGroup() as any).tasks_;
    }

    async function getDeploymentStatus(expStepNum: number) {
        const stepID = await deployment.currentStepID(deployOpID);
        should(stepID.deployOpID).equal(deployOpID);
        should(stepID.deployStepNum).equal(expStepNum);
        return deployment.status(stepID);
    }

    async function checkFinalSimple(
        plan: ExecutionPlanImpl, ret: ExecuteComplete, expDeploy: DeployStatus,
        expTask: TaskState, expElems: AdaptMountedElement[], numNodes: number,
        expTaskNames: string[]) {

        // All Status keys should have zero except for the expStatus
        const makeNodeStatus = (count: number) => {
            const s: any = {};
            Object.keys(DeployStatus).forEach((k) => {
                s[k] = k === expDeploy ? count : 0;
            });
            return s;
        };

        const expPrim = expElems.filter(isFinalDomElement);

        should(ret.deploymentStatus).equal(expDeploy);
        should(ret.nodeStatus).eql(makeNodeStatus(numNodes));
        should(ret.primStatus).eql(makeNodeStatus(expPrim.length));
        should(ret.nonPrimStatus).eql(makeNodeStatus(expElems.length - expPrim.length));

        // All plan nodes should be removed upon successful deploy
        should(plan.nodes).have.length(0);
        should(plan.elems).have.length(0);

        const { deployStatus, goalStatus, elementStatus } =
            await getDeploymentStatus(0);
        should(deployStatus).equal(expDeploy);
        should(goalStatus).equal(expDeploy);
        expElems.forEach((e) => checkElemStatus(elementStatus, e, expDeploy));

        const tasks = getTasks();
        const taskNames = Object.keys(tasks);
        should(taskNames).have.length(expTaskNames.length);
        const expNames = expElems
            .map(plan.getNode)
            .filter(shouldTrackStatus)
            .map((n) => n.element && n.element.id);
        should(taskNames).containDeep(expNames);
        should(taskNames.map((n) => tasks[n]!.description)).containDeep(expTaskNames);
        should(taskNames.map((n) => tasks[n]!.state))
            .containDeep(expTaskNames.map(() => expTask));
    }

    /**
     * Basic plan with 3 kids and one action each. No additional dependencies.
     * Actions all start at once, but complete in the order 2, 0, 1
     *
     * Tests:
     *   - Simplistic plan creation without dependencies
     *   - Actions replace their Element in the graph
     */
    async function createPlan1(goalStatus: GoalStatus) {
        const orig =
            <Group>
                <Prim id={0} />
                <Prim id={1} />
                <Prim id={2} />
            </Group>;
        const { dom, mountedElements } = await doBuild(orig);
        const kids: FinalDomElement[] = dom.props.children;
        const elems = [ dom, ...kids ];

        const spy = sinon.spy();
        const acts = sequentialActs([2, 0, 1], spy);
        const actions = acts.map((a, i) => ({
            type: toChangeType(goalStatus),
            detail: `Action${i}`,
            act: a.act,
            changes: [
                {
                    detail: `Action${i} Change0`,
                    type: toChangeType(goalStatus),
                    element: kids[i]
                }
            ]
        }));

        const plan = createExecutionPlan({
            ...implOpts,
            actions,
            dependencies: {},
            diff: toDiff(mountedElements, goalStatus),
            goalStatus,
            newDom: goalStatus === DeployStatus.Deployed ? dom : null,
        });
        if (!isExecutionPlanImpl(plan)) throw new Error(`Not ExecutionPlanImpl`);

        // Group + 3 kids + 3 Actions
        const expAllNodes = 7;
        should(plan.allNodes).have.length(expAllNodes);
        // Group + 3 Actions (3 kids are removed by their corresponding Action)
        const expNodes = 4;
        should(plan.nodes).have.length(expNodes);
        // Group
        should(plan.elems).have.length(1);
        should(plan.leaves).have.length(1);

        return {
            dom,
            elems,
            expAllNodes,
            kids,
            plan,
            spy,
        };
    }

    it("Should deploy elements with actions (Plan1)", async () => {
        const goal = DeployStatus.Deployed;
        const { dom, elems, expAllNodes, plan, spy } = await createPlan1(goal);
        should(plan.leaves.map((l) => plan.getId(l))).eql([`E:["Group"]`]);

        should(dependencies(plan, { type: DependencyType.FinishStart, ...dependOpts })).eql({
        });
        should(dependencies(plan, { type: DependencyType.StartStart, ...dependOpts })).eql({
            Action0: [dom.id],
            Action1: [dom.id],
            Action2: [dom.id],
        });

        plan.check();
        const ret = await execute({ ...executeOpts, plan });

        await checkFinalSimple(plan, ret, goal, TaskState.Complete, elems, expAllNodes,
            ["Group", "Action0 Change0", "Action1 Change0", "Action2 Change0"]);

        const { stdout, stderr } = logger;
        should(stdout).match(/Doing Action0/);
        should(stdout).match(/Doing Action1/);
        should(stdout).match(/Doing Action2/);
        should(stderr).equal("");

        should(spy.callCount).equal(6); // 2 per action
        // Starts can happen in any order, but all before any completions
        should(spy.getCall(0).args[0]).match(/Action\d started/);
        should(spy.getCall(1).args[0]).match(/Action\d started/);
        should(spy.getCall(2).args[0]).match(/Action\d started/);
        should(spy.getCall(3).args[0]).match(/Action2 completed/);
        should(spy.getCall(4).args[0]).match(/Action0 completed/);
        should(spy.getCall(5).args[0]).match(/Action1 completed/);
    });

    /**
     * Tests a very simple full destroy.
     * - Tests that Actions always happen before Elements affected by the
     *   change, even during destroy when most dependencies reverse.
     */
    it("Should destroy elements with actions (Plan1)", async () => {
        const goal = DeployStatus.Destroyed;
        const { dom, elems, expAllNodes, plan, spy } = await createPlan1(goal);

        should(plan.leaves.map((l) => plan.getId(l))).eql([`E:["Group"]`]);

        should(dependencies(plan, { type: DependencyType.FinishStart, ...dependOpts })).eql({
        });
        should(dependencies(plan, { type: DependencyType.StartStart, ...dependOpts })).eql({
            Action0: [dom.id],
            Action1: [dom.id],
            Action2: [dom.id],
        });

        plan.check();
        const ret = await execute({ ...executeOpts, plan });

        await checkFinalSimple(plan, ret, goal, TaskState.Complete, elems, expAllNodes,
            ["Group", "Action0 Change0", "Action1 Change0", "Action2 Change0"]);

        const { stdout, stderr } = logger;
        should(stdout).match(/Doing Action0/);
        should(stdout).match(/Doing Action1/);
        should(stdout).match(/Doing Action2/);
        should(stderr).equal("");

        should(spy.callCount).equal(6); // 2 per action
        // Starts can happen in any order, but all before any completions
        should(spy.getCall(0).args[0]).match(/Action\d started/);
        should(spy.getCall(1).args[0]).match(/Action\d started/);
        should(spy.getCall(2).args[0]).match(/Action\d started/);
        should(spy.getCall(3).args[0]).match(/Action2 completed/);
        should(spy.getCall(4).args[0]).match(/Action0 completed/);
        should(spy.getCall(5).args[0]).match(/Action1 completed/);
    });

    it("Should fail with simple cycle", async () => {
        const goalStatus: GoalStatus = DeployStatus.Deployed;
        const hand = handle();
        const deps: DependsOnMethod[] = [
            // Depends on itself
            (_gs, h) => makeAllOf("depsRoot", h, [ hand ]),
        ];
        const dep = (id: number, gs: GoalStatus, h: DeployHelpers) => deps[id](gs, h);
        const orig = <DependPrim id={0} handle={hand} dep={dep} />;
        const { dom, mountedElements } = await doBuild(orig);

        const plan = createExecutionPlan({
            ...implOpts,
            actions: [],
            dependencies: {},
            diff: toDiff(mountedElements, goalStatus),
            goalStatus,
            newDom: goalStatus === DeployStatus.Deployed ? dom : null,
        });
        if (!isExecutionPlanImpl(plan)) throw new Error(`Not ExecutionPlanImpl`);

        should(plan.nodes).have.length(1);
        should(plan.elems).have.length(1);
        should(plan.leaves).have.length(0);
        try {
            plan.check();
            throw new Error("OOPS");
        } catch (err) {
            should(err.message).be.a.String();
            if (err.message === "OOPS") throw new Error(`plan.check() should have thrown but didn't`);

            // tslint:disable: no-trailing-whitespace
            should(err.message).equal(
`There are circular dependencies present in this deployment:
Dependencies:
   0: /DependPrim  
   ->  0: /DependPrim  [FinishStart]
Details:
 0: /DependPrim
    key: DependPrim
    id: ["DependPrim"]`);
            // tslint:enable: no-trailing-whitespace
        }
    });

    it("Should fail with larger cycles", async () => {
        const goalStatus = DeployStatus.Deployed;
        const hands = makeHandles(4);
        const deps: DependsOnMethod[] = [
            (_gs, h) => makeAllOf("depsKid0", h, [ hands[1] ]),
            (_gs, h) => makeAllOf("depsKid1", h, [ hands[2] ]),
            (_gs, h) => makeAllOf("depsKid2", h, [ hands[3] ]),
            (_gs, h) => makeAllOf("depsKid3", h, [ hands[0] ]),
        ];
        const dep = (id: number, gs: GoalStatus, h: DeployHelpers) => deps[id](gs, h);
        const orig =
            <Group>
                <DependPrim id={0} handle={hands[0]} dep={dep} />
                <DependPrim id={1} handle={hands[1]} dep={dep} />
                <DependPrim id={2} handle={hands[2]} dep={dep} />
                <DependPrim id={3} handle={hands[3]} dep={dep} />
            </Group>;
        const { dom, mountedElements } = await doBuild(orig);

        const plan = createExecutionPlan({
            ...implOpts,
            actions: [],
            dependencies: {},
            diff: toDiff(mountedElements, goalStatus),
            goalStatus,
            newDom: goalStatus === DeployStatus.Deployed ? dom : null,
        });
        if (!isExecutionPlanImpl(plan)) throw new Error(`Not ExecutionPlanImpl`);

        should(plan.nodes).have.length(5);
        should(plan.elems).have.length(5);
        should(plan.leaves).have.length(1);
        try {
            plan.check();
            throw new Error("OOPS");
        } catch (err) {
            should(err.message).be.a.String();
            if (err.message === "OOPS") throw new Error(`plan.check() should have thrown but didn't`);

            // tslint:disable: no-trailing-whitespace
            should(err.message).equal(
`There are circular dependencies present in this deployment:
Dependencies:
   0: /Group/DependPrim  
   ->  1: /Group/DependPrim  [FinishStart]
   ->  2: /Group/DependPrim  [FinishStart]
   ->  3: /Group/DependPrim  [FinishStart]
   ->  0: /Group/DependPrim  [FinishStart]
Details:
 0: /Group/DependPrim
    key: DependPrim
    id: ["Group","DependPrim"]
 1: /Group/DependPrim
    key: DependPrim1
    id: ["Group","DependPrim1"]
 2: /Group/DependPrim
    key: DependPrim2
    id: ["Group","DependPrim2"]
 3: /Group/DependPrim
    key: DependPrim3
    id: ["Group","DependPrim3"]`);
            // tslint:enable: no-trailing-whitespace
        }
    });

    /**
     * Tests that dependents fail when a node fails.
     * kid2 will throw an error.
     * Dependencies:
     *   kid0 -> kid1 - Tests chained dependency
     *   kid1 -> kid2 - Tests immediate dependency
     *   kid2 -> kid3 - Tests that kid3 is unaffected by kid2 error
     *   kid3 -> (none)
     *   kid4 -> kid2 - Tests immediate dependency
     */
    it("Should fail dependents on error", async () => {
        const goal = DeployStatus.Deployed;
        const hands = makeHandles(5);
        const deps: DependsOnMethod[] = [
            (_gs, h) => makeAllOf("depsKid0", h, [ hands[1] ]),
            (_gs, h) => makeAllOf("depsKid1", h, [ hands[2] ]),
            (_gs, h) => makeAllOf("depsKid2", h, [ hands[3] ]),
            (_gs, h) => undefined,
            (_gs, h) => makeAllOf("depsKid4", h, [ hands[2] ]),
        ];
        const dep = (id: number, gs: GoalStatus, h: DeployHelpers) => deps[id](gs, h);
        const orig =
            <Group>
                <DependPrim id={0} handle={hands[0]} dep={dep} />
                <DependPrim id={1} handle={hands[1]} dep={dep} />
                <DependPrim id={2} handle={hands[2]} dep={dep} />
                <DependPrim id={3} handle={hands[3]} />
                <DependPrim id={4} handle={hands[4]} dep={dep} />
            </Group>;
        const { dom, mountedElements } = await doBuild(orig);
        const kids: FinalDomElement[] = dom.props.children;

        const actions = kids.map((k, i) => {
            const act = i === 2 ?
                async () => { throw new Error(`Action error`); } :
                async () => { /**/ };
            return {
                type: ChangeType.create,
                detail: `Action${i}`,
                act,
                changes: [
                    {
                        detail: `Action${i} Change0`,
                        type: ChangeType.create,
                        element: k
                    }
                ]
            };
        });

        const plan = createExecutionPlan({
            ...implOpts,
            actions,
            dependencies: {},
            diff: toDiff(mountedElements, goal),
            goalStatus: goal,
            newDom: goal === DeployStatus.Deployed ? dom : null,
        });
        if (!isExecutionPlanImpl(plan)) throw new Error(`Not ExecutionPlanImpl`);

        // 6 elems + 5 actions
        should(plan.allNodes).have.length(11);
        // 1 elem (Group) + 5 actions. (kids are removed by matching actions)
        should(plan.nodes).have.length(6);
        // Group
        should(plan.elems).have.length(1);
        should(plan.leaves).have.length(1);

        plan.check();
        const ret = await execute({ ...executeOpts, plan });

        should(ret.deploymentStatus).equal(DeployStatus.Failed);
        should(ret.nodeStatus).eql({
            [DeployStatus.Deployed]: 2,
            [DeployStatus.Deploying]: 0,
            [DeployStatus.Destroyed]: 0,
            [DeployStatus.Destroying]: 0,
            [DeployStatus.Failed]: 9,
            [DeployStatus.Initial]: 0,
            [DeployStatus.Waiting]: 0,
        });
        should(ret.primStatus).eql({
            [DeployStatus.Deployed]: 1,
            [DeployStatus.Deploying]: 0,
            [DeployStatus.Destroyed]: 0,
            [DeployStatus.Destroying]: 0,
            [DeployStatus.Failed]: 5,
            [DeployStatus.Initial]: 0,
            [DeployStatus.Waiting]: 0,
        });

        const { stdout, stderr } = logger;
        const lines = stdout.split("\n");
        should(lines).have.length(3);
        should(lines[0]).match(/Doing Action3/);
        should(lines[1]).match(/Doing Action2/);
        should(lines[2]).equal("");
        should(stderr).match(/Error while Action2/);
        should(stderr).match(/Error: Action error/);

        const { deployStatus, goalStatus, elementStatus } =
            await getDeploymentStatus(0);
        should(deployStatus).equal(DeployStatus.Failed);
        should(goalStatus).equal(DeployStatus.Deployed);
        checkElemStatus(elementStatus, dom, DeployStatus.Failed,
            /A dependency failed to deploy successfully/);
        checkElemStatus(elementStatus, kids[0], DeployStatus.Failed,
            /A dependency failed to deploy successfully/);
        checkElemStatus(elementStatus, kids[1], DeployStatus.Failed,
            /A dependency failed to deploy successfully/);
        checkElemStatus(elementStatus, kids[2], DeployStatus.Failed,
            /Action error/);
        checkElemStatus(elementStatus, kids[3], DeployStatus.Deployed);
        checkElemStatus(elementStatus, kids[4], DeployStatus.Failed,
            /A dependency failed to deploy successfully/);

        const tasks = getTasks();
        const taskNames = Object.keys(tasks);
        should(taskNames).containDeep(kids.map((k) => k.id));
        should(taskNames.map((n) => tasks[n]!.description))
            .containDeep([
                "Action0 Change0", "Action1 Change0",
                "Action2 Change0", "Action3 Change0", "Action4 Change0"
            ]);
        should(taskNames.map((n) => tasks[n]!.state))
            .containDeep([TaskState.Failed, TaskState.Failed,
                TaskState.Failed, TaskState.Complete, TaskState.Failed]);
    });

    it("Should time out", async () => {
        const timeout = 100;
        const goal: GoalStatus = DeployStatus.Deployed;
        const hands = makeHandles(5);
        // Add dependencies to make the Actions sequential.
        // Execution order: 0, 1, 2, 3, 4
        const deps: DependsOnMethod[] = [
            (_gs, h) => undefined,
            (_gs, h) => makeAllOf("depsKid1", h, [ hands[0] ]),
            (_gs, h) => makeAllOf("depsKid2", h, [ hands[1] ]),
            (_gs, h) => makeAllOf("depsKid3", h, [ hands[2] ]),
            (_gs, h) => makeAllOf("depsKid4", h, [ hands[3] ]),
        ];
        const dep = (id: number, gs: GoalStatus, h: DeployHelpers) => deps[id](gs, h);
        const orig =
            <Group>
                <DependPrim id={0} handle={hands[0]} dep={dep} />
                <DependPrim id={1} handle={hands[1]} dep={dep} />
                <DependPrim id={2} handle={hands[2]} dep={dep} />
                <DependPrim id={3} handle={hands[3]} dep={dep} />
                <DependPrim id={4} handle={hands[4]} dep={dep} />
            </Group>;
        const { dom, mountedElements } = await doBuild(orig);
        const kids: FinalDomElement[] = dom.props.children;
        const spy = sinon.spy();

        // Actions 0 and 1 return immediately but the rest take more time than
        // the execute timeout.
        const actions = kids.map((k, i) => ({
            type: ChangeType.create,
            detail: `Action${i}`,
            act: i > 1 ?
                async () => {
                    spy(`Action${i}`);
                    await sleep(timeout * 2);
                }
                :
                async () => spy(`Action${i}`),
            changes: [{
                detail: `Action${i} Change0`,
                type: ChangeType.create,
                element: k
            }]
        }));

        const plan = createExecutionPlan({
            ...implOpts,
            actions,
            dependencies: {},
            diff: toDiff(mountedElements, goal),
            goalStatus: goal,
            newDom: goal === DeployStatus.Deployed ? dom : null,
        });
        if (!isExecutionPlanImpl(plan)) throw new Error(`Not ExecutionPlanImpl`);

        // Group + 5 kids + 5 Actions
        should(plan.allNodes).have.length(11);
        // Group + 5 Actions (kids are removed by their associated action)
        should(plan.nodes).have.length(6);
        // Group
        should(plan.elems).have.length(1);
        should(plan.leaves).have.length(1);

        plan.check();
        const ret = await execute({ ...executeOpts, plan, timeoutMs: timeout });

        should(ret.deploymentStatus).equal(DeployStatus.Failed);
        should(ret.nodeStatus).eql({
            [DeployStatus.Deployed]: 4,
            [DeployStatus.Deploying]: 0,
            [DeployStatus.Destroyed]: 0,
            [DeployStatus.Destroying]: 0,
            [DeployStatus.Failed]: 7,
            [DeployStatus.Initial]: 0,
            [DeployStatus.Waiting]: 0,
        });
        should(ret.primStatus).eql({
            [DeployStatus.Deployed]: 2,
            [DeployStatus.Deploying]: 0,
            [DeployStatus.Destroyed]: 0,
            [DeployStatus.Destroying]: 0,
            [DeployStatus.Failed]: 4,
            [DeployStatus.Initial]: 0,
            [DeployStatus.Waiting]: 0,
        });

        const { stdout, stderr } = logger;
        const lines = stdout.split("\n");
        should(lines).have.length(4);
        should(lines[0]).match(/Doing Action0/);
        should(lines[1]).match(/Doing Action1/);
        should(lines[2]).match(/Doing Action2/);
        should(lines[3]).equal("");
        should(stderr).match(/Deploy operation failed: Deploy operation timed out after 0.1 seconds/);

        should(spy.callCount).equal(3);
        should(spy.getCall(0).args[0]).equal("Action0");
        should(spy.getCall(1).args[0]).equal("Action1");
        should(spy.getCall(2).args[0]).equal("Action2");

        const { deployStatus, goalStatus, elementStatus } =
            await getDeploymentStatus(0);
        should(deployStatus).equal(DeployStatus.Failed);
        should(goalStatus).equal(DeployStatus.Deployed);
        checkElemStatus(elementStatus, dom, DeployStatus.Failed);
        kids.forEach((k, i) => {
            if (i > 1) {
                checkElemStatus(elementStatus, k, DeployStatus.Failed,
                    /^Deploy operation timed out after 0.1 seconds$/);
            } else {
                checkElemStatus(elementStatus, k, DeployStatus.Deployed);
            }
        });
    });

    it("Should not run actions or modify state on dryRun", async () => {
        const goal: GoalStatus = DeployStatus.Deployed;
        const plan = new ExecutionPlanImpl({ ...implOpts, goalStatus: goal });
        const orig =
            <Group>
                <Prim id={0} />
                <Prim id={1} />
                <Prim id={2} />
            </Group>;
        const { dom } = await doBuild(orig);
        const kids: FinalDomElement[] = dom.props.children;
        const elems = [ dom, ...kids ];

        elems.forEach((e) => plan.addElem(e, goal));

        should(plan.nodes).have.length(4);
        should(plan.elems).have.length(4);
        should(plan.leaves).have.length(4);

        const spy = sinon.spy();
        const acts = sequentialActs([2, 0, 1], spy);
        const actions = acts.map((a, i) => ({
            type: ChangeType.create,
            detail: `Action${i}`,
            act: a.act,
            changes: [
                {
                    detail: `Action${i} Change0`,
                    type: ChangeType.create,
                    element: kids[i]
                }
            ]
        }));
        actions.forEach((a) => plan.addAction(a));

        should(plan.allNodes).have.length(7);
        should(plan.nodes).have.length(4);
        should(plan.elems).have.length(1);
        should(plan.leaves).have.length(4);

        const firstStepID: DeployStepID = {
            deployOpID: 0,
            deployStepNum: 0,
        };
        await should(deployment.status(firstStepID)).be.rejectedWith("Deployment step ID 0.0 not found");

        plan.check();
        const ret = await execute({ ...executeOpts, plan, dryRun: true });

        should(ret.deploymentStatus).equal(goal);
        should(ret.nodeStatus).eql({
            [DeployStatus.Deployed]: 7,
            [DeployStatus.Deploying]: 0,
            [DeployStatus.Destroyed]: 0,
            [DeployStatus.Destroying]: 0,
            [DeployStatus.Failed]: 0,
            [DeployStatus.Initial]: 0,
            [DeployStatus.Waiting]: 0,
        });
        should(ret.primStatus).eql({
            [DeployStatus.Deployed]: 4,
            [DeployStatus.Deploying]: 0,
            [DeployStatus.Destroyed]: 0,
            [DeployStatus.Destroying]: 0,
            [DeployStatus.Failed]: 0,
            [DeployStatus.Initial]: 0,
            [DeployStatus.Waiting]: 0,
        });

        const { stdout, stderr } = logger;
        should(stdout).match(/Doing Action0/);
        should(stdout).match(/Doing Action1/);
        should(stdout).match(/Doing Action2/);
        should(stderr).equal("");

        should(spy.callCount).equal(0);

        // Should still be no first sequence created
        await should(deployment.status(firstStepID)).be.rejectedWith("Deployment step ID 0.0 not found");

        const tasks = getTasks();
        const taskNames = Object.keys(tasks);
        should(taskNames).containDeep(kids.map((k) => k.id));
        should(taskNames.map((n) => tasks[n]!.description))
            .containDeep(["Action0 Change0", "Action1 Change0", "Action2 Change0"]);
        should(taskNames.map((n) => tasks[n]!.state))
            .containDeep([TaskState.Skipped, TaskState.Skipped, TaskState.Skipped]);
    });

    it("Should mark elements Deploying while actions run", async () => {
        const goalStatus: GoalStatus = DeployStatus.Deployed;
        const hands = makeHandles(3);
        // Execution order: 2, 0, 1
        const deps: DependsOnMethod[] = [
            (_gs, h) => makeAllOf("depsKid0", h, [ hands[2] ]),
            (_gs, h) => makeAllOf("depsKid1", h, [ hands[0] ]),
            (_gs, h) => undefined,
        ];
        const dep = (id: number, gs: GoalStatus, h: DeployHelpers) => deps[id](gs, h);
        const orig =
            <Group>
                <DependPrim id={0} handle={hands[0]} dep={dep} />
                <DependPrim id={1} handle={hands[1]} dep={dep} />
                <DependPrim id={2} handle={hands[2]} dep={dep} />
            </Group>;
        const { dom, mountedElements } = await doBuild(orig);
        const kids: FinalDomElement[] = dom.props.children;
        const elems = [ dom, ...kids ];

        const expectedStatus = [
            //    kid0                   kid1                   kid2
            // Executes second
            [DeployStatus.Deploying, DeployStatus.Waiting, DeployStatus.Deployed],
            // Executes last
            [DeployStatus.Deployed, DeployStatus.Deploying, DeployStatus.Deployed],
            // Executes first
            [DeployStatus.Waiting, DeployStatus.Waiting, DeployStatus.Deploying],
        ];
        const expectedTaskState = [
            [TaskState.Started, TaskState.Created, TaskState.Complete],
            [TaskState.Complete, TaskState.Started, TaskState.Complete],
            [TaskState.Created, TaskState.Created, TaskState.Started],
        ];
        const spy = sinon.spy();
        const actionCheck = async (idx: number) => {
            spy(`Action${idx} started`);
            const tList = getTasks();
            const s = await getDeploymentStatus(0);
            kids.forEach((k, i) => {
                try {
                    checkElemStatus(s.elementStatus, k, expectedStatus[idx][i]);
                } catch (err) {
                    throw new Error(`checkElemStatus failed in Action${idx} kid[${i}]: ${err}`);
                }
                const t = tList[k.id];
                if (t === undefined) throw should(t).not.be.Undefined();
                should(t.state).equal(expectedTaskState[idx][i]);
            });
        };

        const actions = kids.map((k, i) => ({
            type: ChangeType.create,
            detail: `Action${i}`,
            act: async () => actionCheck(i),
            changes: [
                {
                    detail: `Creating Action${i}`,
                    element: k,
                    type: ChangeType.create,
                }
            ]
        }));

        const plan = createExecutionPlan({
            ...implOpts,
            actions,
            dependencies: {},
            diff: toDiff(mountedElements, goalStatus),
            goalStatus,
            newDom: goalStatus === DeployStatus.Deployed ? dom : null,
        });
        if (!isExecutionPlanImpl(plan)) throw new Error(`Not ExecutionPlanImpl`);

        // Group + 3 kids + 3 actions
        const expAllNodes = 7;
        should(plan.allNodes).have.length(expAllNodes);
        // Group + 3 actions (kids are removed by the actions)
        const expNodes = 4;
        should(plan.nodes).have.length(expNodes);
        // Just the Group
        should(plan.elems).have.length(1);
        should(plan.leaves).have.length(1);

        plan.check();
        const ret = await execute({ ...executeOpts, plan });

        await checkFinalSimple(plan, ret, DeployStatus.Deployed,
            TaskState.Complete, elems, expAllNodes,
            ["Group", "Creating Action0", "Creating Action1", "Creating Action2"]);

        const { stdout, stderr } = logger;
        const lines = stdout.split("\n");
        should(lines).have.length(4);
        should(lines[0]).match(/Doing Action2/);
        should(lines[1]).match(/Doing Action0/);
        should(lines[2]).match(/Doing Action1/);
        should(lines[3]).equal("");
        should(stderr).equal("");

        should(spy.callCount).equal(3);
        should(spy.getCall(0).args[0]).match(/Action2 started/);
        should(spy.getCall(1).args[0]).match(/Action0 started/);
        should(spy.getCall(2).args[0]).match(/Action1 started/);
    });

    it("Should mark elements Destroying while actions run");

    it("Should give unassociated handle error", async () => {
        const goal: GoalStatus = DeployStatus.Deployed;
        const plan = new ExecutionPlanImpl({ ...implOpts, goalStatus: goal });
        const dep = (id: number, gs: GoalStatus, h: DeployHelpers) =>
            makeAllOf("desc", h, [ handle() ]);

        const orig =
            <Group>
                <DependPrim id={0} dep={dep}/>
            </Group>;
        const { dom } = await doBuild(orig);

        const errRE = RegExp(
            `A Component dependsOn method returned a DependsOn ` +
            `object 'desc' that contains ` +
            `a Handle that is not associated with any Element`);

        plan.addElem(dom, goal);
        should(() => plan.addElem(dom.props.children, goal)).throwError(errRE);
    });

    // Checks the internals of how dependencies get notified. Verifies that
    // each time any of a node's dependencies has an update, the node gets
    // notified to re-check its dependencies. This is what enables "OR"
    // dependencies to function in addition to more traditional "AND"
    // dependencies.
    it("Should check primitive element dependsOn", async () => {
        const goalStatus: GoalStatus = DeployStatus.Deployed;
        const spy = sinon.spy();
        const hands = makeHandles(6);

        // Add the following dependencies:
        //   kid0 -> kid1
        //   kid1 -> kid2
        //   kid2 -> (none)
        //   kid3 -> kid0
        //   kid4 -> kid0, kid1
        //   kid5 -> kid0, kid1, kid2
        const depFuncs = hands.map<DependsOnMethod>((_hand, i) =>
            (gs: GoalStatus, h: DeployHelpers) => {
                const deps: Handle[] = [];
                switch (i) {
                    case 0: deps.push(hands[1]); break;
                    case 1: deps.push(hands[2]); break;
                    case 3: deps.push(hands[0]); break;
                    case 4: deps.push(hands[0], hands[1]); break;
                    case 5: deps.push(hands[0], hands[1], hands[2]); break;
                }
                return AllOfTester({
                    description: `allof${i}`,
                    helpers: h,
                    deps,
                    checkReady: (stat) => spy(`checkReady${i} ` +
                        (stat === true ? "ready" : "waiting")),
                });
            }
        );
        const dep = (id: number, gs: GoalStatus, h: DeployHelpers) => depFuncs[id](gs, h);

        const orig =
            <Group>
                { hands.map((h, id) => <DependPrim id={id} dep={dep} handle={h} />) }
            </Group>;
        const { dom, mountedElements } = await doBuild(orig);
        const kids: FinalDomElement[] = dom.props.children;
        const elems = [ dom, ...kids ];

        // Only the first 3 kids have actions
        const actions = kids.slice(0, 3).map((k, i) => ({
            type: ChangeType.create,
            detail: `Action${i}`,
            act: async () => spy(`Action${i} completed`),
            changes: [
                {
                    detail: `Action${i} Change0`,
                    type: ChangeType.create,
                    element: k
                }
            ]
        }));

        const plan = createExecutionPlan({
            ...implOpts,
            actions,
            dependencies: {},
            diff: toDiff(mountedElements, goalStatus),
            goalStatus,
            newDom: goalStatus === DeployStatus.Deployed ? dom : null,
        });
        if (!isExecutionPlanImpl(plan)) throw new Error(`Not ExecutionPlanImpl`);

        // 1 Group, 6 kids, 3 actions
        const expAllNodes = 10;
        should(plan.allNodes).have.length(expAllNodes);
        // 1 Group, 3 kids with no action, 3 actions. (3 kids are removed by 3 actions)
        const expNodes = 7;
        should(plan.nodes).have.length(expNodes);
        // 1 Group, 3 kids
        should(plan.elems).have.length(4);
        should(plan.leaves).have.length(1);

        should(dependencies(plan, { type: DependencyType.FinishStart, ...dependOpts })).eql({
            Action0: [ "Action1" ],
            Action1: [ "Action2" ],
            // kid2 has no dependencies
            [kids[3].id]: [ "Action0" ],
            [kids[4].id]: [ "Action0", "Action1" ],
            [kids[5].id]: [ "Action0", "Action1", "Action2" ],
        });

        plan.check();
        const ret = await execute({ ...executeOpts, plan });

        await checkFinalSimple(plan, ret, DeployStatus.Deployed,
            TaskState.Complete, elems, expAllNodes,
            [
                "Group", "Action0 Change0", "Action1 Change0", "Action2 Change0",
                "DependPrim", "DependPrim", "DependPrim"
            ]);

        const { stdout, stderr } = logger;
        should(stderr).equal("");
        const lines = stdout.split("\n");
        should(lines[0]).match(/Doing Action2/);
        should(lines[1]).match(/Doing Action1/);
        should(lines[2]).match(/Doing Action0/);
        should(lines[3]).match("");

        const calls: string[] = spyArgs(spy, 0);
        // These calls should be in 4 groups. The first group is before
        // completing the first Action, then all others starting with
        // an action completed.
        const groups = makeActionGroups(calls);
        should(groups).have.length(4);

        // The root node is the graph leaf and starts first. All of the
        // kids have a StartStart dependency on the root, so they all get
        // notified to check their dependencies, in non-deterministic order.
        should(groups[0]).containDeep([
            "checkReady0 waiting",
            "checkReady1 waiting",
            "checkReady2 ready",   // only 2 is ready
            "checkReady3 waiting",
            "checkReady4 waiting",
            "checkReady5 waiting",
        ]);

        // Due to dependencies, Action2 is the first to complete.
        should(groups[1][0]).equal("Action2 completed");
        // The associated Element (kid2) will get queued and check its
        // dependencies again before any other.
        should(groups[1][1]).equal("checkReady2 ready");
        // When the kid2 Element and Action are both complete, all nodes that
        // depend on it get notified, in non-deterministic order.
        should(groups[1].slice(2)).containDeep([
            "checkReady1 ready",
            "checkReady5 waiting",
        ]);

        // Action1 completes next
        should(groups[2][0]).equal("Action1 completed");
        // Dependency for kid1 Element checks before the kid Element can complete
        should(groups[2][1]).equal("checkReady1 ready");
        // And then the nodes that depend on kid1/Action1 get notified
        should(groups[2].slice(2)).containDeep([
            "checkReady0 ready",
            "checkReady4 waiting",
            "checkReady5 waiting",
        ]);

        should(groups[3][0]).equal("Action0 completed");
        should(groups[3][1]).equal("checkReady0 ready");
        should(groups[3].slice(2)).containDeep([
            "checkReady3 ready",
            "checkReady4 ready",
            "checkReady5 ready",
        ]);
    });

    function makeActionGroups(calls: string[]) {
        const groups: string[][] = [];
        let cur: string[] | null = null;
        calls.forEach((c) => {
            if (!cur || c.startsWith("Action")) {
                cur = [];
                groups.push(cur);
            }
            cur.push(c);
        });
        return groups;
    }

    it("Should give correct goalStatus to elements", async () => {
        const goal: GoalStatus = DeployStatus.Deployed;
        const spy = sinon.spy();
        const dep = (tag: string) => (id: number, gStat: DeployStatus): DependsOn => ({
            description: `${tag}${id} wait`,
            ready: () => {
                spy(`${tag}${id} ready: ${gStat}`);
                return true;
            }
        });
        const when = (tag: string) => (id: number, gStat: GoalStatus): true => {
            spy(`${tag}${id} when: ${gStat}`);
            return true;
        };
        const oldOrig =
            <Group>
                <DependPrim key="0" id={0} dep={dep("old")} when={when("old")} />
                <DependPrim key="1" id={1} dep={dep("old")} when={when("old")} />
            </Group>;
        const { dom: oldDom } = await doBuild(oldOrig);
        const oldKids: FinalDomElement[] = oldDom.props.children;
        const newOrig =
            <Group>
                <DependPrim key="0" id={0} dep={dep("new")} when={when("new")} />
                <DependPrim key="2" id={2} dep={dep("new")} when={when("new")} />
            </Group>;
        const { dom: newDom } = await doBuild(newOrig);
        const newKids: FinalDomElement[] = newDom.props.children;
        const elems = [ newDom, ...newKids ];

        const action: Action = {
            type: ChangeType.modify,
            detail: `One Action`,
            act: async () => {/* */},
            changes: [
                {
                    detail: `Updating id0`,
                    type: ChangeType.modify,
                    element: newKids[0]
                },
                {
                    detail: `Deleting id1`,
                    type: ChangeType.delete,
                    element: oldKids[1]
                },
                {
                    detail: `Creating id2`,
                    type: ChangeType.create,
                    element: newKids[1]
                },
            ]
        };

        const plan = createExecutionPlan({
            ...implOpts,
            goalStatus: goal,
            actions: [action],
            dependencies: {},
            diff: domDiff(oldDom, newDom),
            newDom,
        });
        if (!isExecutionPlanImpl(plan)) throw new Error(`Not ExecutionPlanImpl`);

        // 3 elems in newDom, 1 action, 1 elem from oldDom
        const expAllNodes = 5;
        should(plan.allNodes).have.length(expAllNodes);

        // 1 elem (Group) and 1 action. 3 other elems are removed from the graph.
        const expNodes = 2;
        should(plan.nodes).have.length(expNodes);

        // Just the Group elem
        should(plan.elems).have.length(1);

        // Root of Deployed tree. No separate Destroyed tree because the
        // single action contains all of the items that would have been in
        // the Destroyed tree.
        should(plan.leaves).have.length(1);

        should(dependencies(plan, { type: DependencyType.StartStart, ...dependOpts })).eql({
            "One Action": [ elems[0].id ],
        });

        plan.check();
        const ret = await execute({ ...executeOpts, plan });

        // We don't care about repeat calls or order
        const calls = uniq(spyArgs(spy, 0)).sort();
        should(calls).eql([
            "new0 ready: Deployed",
            "new0 when: Deployed",
            "new2 ready: Deployed",
            "new2 when: Deployed",
            "old1 when: Destroyed",
        ]);

        should(ret.deploymentStatus).equal(goal);
        should(ret.nodeStatus).eql({
            [DeployStatus.Deployed]: 4,
            [DeployStatus.Deploying]: 0,
            [DeployStatus.Destroyed]: 1,
            [DeployStatus.Destroying]: 0,
            [DeployStatus.Failed]: 0,
            [DeployStatus.Initial]: 0,
            [DeployStatus.Waiting]: 0,
        });
        should(ret.primStatus).eql({
            [DeployStatus.Deployed]: 3,
            [DeployStatus.Deploying]: 0,
            [DeployStatus.Destroyed]: 1,
            [DeployStatus.Destroying]: 0,
            [DeployStatus.Failed]: 0,
            [DeployStatus.Initial]: 0,
            [DeployStatus.Waiting]: 0,
        });

        // All plan nodes should be removed upon successful deploy
        should(plan.nodes).have.length(0);
        should(plan.elems).have.length(0);

        const { deployStatus, goalStatus, elementStatus } =
            await getDeploymentStatus(0);
        should(deployStatus).equal(goal);
        should(goalStatus).equal(goal);
        should(Object.keys(elementStatus)).have.length(4);
        elems.forEach((e) => checkElemStatus(elementStatus, e, DeployStatus.Deployed));
        checkElemStatus(elementStatus, oldKids[1], DeployStatus.Destroyed);

        const expTaskNames = [
            "Group",
            "Updating id0",
            "Deleting id1",
            "Creating id2",
        ];
        const tasks = getTasks();
        const taskNames = Object.keys(tasks);
        should(taskNames).have.length(expTaskNames.length);
        should(taskNames).containDeep([...newKids, oldKids[1]].map((e) => e.id));
        should(taskNames.map((n) => tasks[n]!.description)).containDeep(expTaskNames);
        should(taskNames.map((n) => tasks[n]!.state))
            .containDeep(expTaskNames.map(() => TaskState.Complete));

        const { stdout, stderr } = logger;
        should(stdout).match(/Doing One Action/);
        should(stderr).equal("");
    });

    /**
     * Tests fairly basic setup using createExecutionPlan.
     * - Tests plan groups/leaders (Action + changed elements)
     *   - Actions always deploy first
     *   - Dependencies of all elements in group are met before Action runs
     * - Tests component dependsOn
     * - Tests basic component deployedWhen
     * Dependencies:
     *  root -> none
     *  kid0/Action0 -> kid1, kid2, kid3
     *  kid1/Action1 -> kid2
     *  kid2/Action2 -> kid3
     *  kid3/Action3 -> none
     */
    async function createPlanC(goal: GoalStatus) {
        const spy = sinon.spy();
        const hands = makeHandles(5);
        const kHands = hands.slice(1);
        const deps: DependsOnMethod[] = [
            () => undefined,
            (_gs, h) => makeAllOf("depsKid0", h, [ kHands[1], kHands[2], kHands[3] ]),
            (_gs, h) => makeAllOf("depsKid1", h, [ kHands[2] ]),
            (_gs, h) => makeAllOf("depsKid2", h, [ kHands[3] ]),
            (_gs, _h) => ({ description: "depsKid3", ready: () => true }),
        ];
        const dep = (id: number, gs: GoalStatus, h: DeployHelpers) => deps[id](gs, h);
        const when = (id: number, gs: GoalStatus): true => {
            const name = id === 0 ? "Root" : id - 1;
            spy(`When${name} called: ${gs}`);
            return true;
        };
        const orig =
            <DependPrim key="root" id={0} handle={hands[0]} dep={dep} when={when} >
                <DependPrim key="kid0" id={1} handle={hands[1]} dep={dep} when={when} />
                <DependPrim key="kid1" id={2} handle={hands[2]} dep={dep} when={when} />
                <DependPrim key="kid2" id={3} handle={hands[3]} dep={dep} when={when} />
                <DependPrim key="kid3" id={4} handle={hands[4]} dep={dep} when={when} />
            </DependPrim>;
        const { dom, mountedElements } = await doBuild(orig);
        const kids: FinalDomElement[] = dom.props.children;
        const elems = [ dom, ...kids ];
        const changeType = toChangeType(goal);

        const actions: Action[] = kids.map((k, i) => ({
            detail: `Action${i}`,
            type: changeType,
            act: () => spy(`Action${i} called`),
            changes: [{
                detail: `Change${i}`,
                type: changeType,
                element: k,
            }]
        }));

        const plan = createExecutionPlan({
            ...planOpts,
            actions,
            diff: toDiff(mountedElements, goal),
            goalStatus: goal,
            newDom: goal === DeployStatus.Deployed ? dom : null,
        });

        if (!isExecutionPlanImpl(plan)) throw new Error(`Not ExecutionPlanImpl`);

        const expAllNodes = 9;  // 5 Primitive + 4 actions
        const expNodes = 5;     // 1 Primitive + 4 actions (the actions replace their primitive)
        should(plan.allNodes).have.length(expAllNodes);
        should(plan.nodes).have.length(expNodes);
        should(plan.elems).have.length(1);

        return {
            elems,
            expAllNodes,
            kids,
            plan,
            spy,
        };
    }

    it("Should deploy plan with dependencies (PlanC)", async () => {
        const goal: GoalStatus = DeployStatus.Deployed;
        const { elems, expAllNodes, plan, spy } = await createPlanC(goal);

        should(dependencies(plan, { type: DependencyType.FinishStart, ...dependOpts })).eql({
            Action0: [ "Action1", "Action2", "Action3" ],
            Action1: [ "Action2" ],
            Action2: [ "Action3" ],
        });
        should(dependencies(plan, { type: DependencyType.StartStart, ...dependOpts })).eql({
            Action0: [ elems[0].id ],
            Action1: [ elems[0].id ],
            Action2: [ elems[0].id ],
            Action3: [ elems[0].id ],
        });

        should(plan.leaves).have.length(1);  // root

        plan.check();
        const ret = await execute({ ...executeOpts, plan });

        await checkFinalSimple(plan, ret, goal,
            TaskState.Complete, elems, expAllNodes,
            ["DependPrim", "Change0", "Change1", "Change2", "Change3"]);

        const { stdout, stderr } = logger;
        const lines = stdout.split("\n");
        should(lines).have.length(5);
        should(lines[0]).match(/Doing Action3/);
        should(lines[1]).match(/Doing Action2/);
        should(lines[2]).match(/Doing Action1/);
        should(lines[3]).match(/Doing Action0/);
        should(lines[4]).equal("");
        should(stderr).equal("");

        const calls = spyArgs(spy, 0);
        should(calls).eql([
            "WhenRoot called: Deployed",
            "Action3 called",
            "When3 called: Deployed",
            "Action2 called",
            "When2 called: Deployed",
            "Action1 called",
            "When1 called: Deployed",
            "Action0 called",
            "When0 called: Deployed",
        ]);
    });

    it("Should destroy plan with dependencies (PlanC)", async () => {
        const goal: GoalStatus = DeployStatus.Destroyed;
        const { elems, expAllNodes, plan, spy } = await createPlanC(goal);

        should(dependencies(plan, { type: DependencyType.FinishStart, ...dependOpts })).eql({
            Action1: [ "Action0" ],
            Action2: [ "Action0", "Action1" ],
            Action3: [ "Action0", "Action2" ],
        });
        should(dependencies(plan, { type: DependencyType.StartStart, ...dependOpts })).eql({
            Action0: [ elems[0].id ],
            Action1: [ elems[0].id ],
            Action2: [ elems[0].id ],
            Action3: [ elems[0].id ],
        });

        should(plan.leaves).have.length(1);

        plan.check();
        const ret = await execute({ ...executeOpts, plan });

        await checkFinalSimple(plan, ret, goal,
            TaskState.Complete, elems, expAllNodes,
            ["DependPrim", "Change0", "Change1", "Change2", "Change3"]);

        const { stdout, stderr } = logger;
        const lines = stdout.split("\n");
        should(lines).have.length(5);
        should(lines[0]).match(/Doing Action0/);
        should(lines[1]).match(/Doing Action1/);
        should(lines[2]).match(/Doing Action2/);
        should(lines[3]).match(/Doing Action3/);
        should(lines[4]).equal("");
        should(stderr).equal("");

        const calls = spyArgs(spy, 0);
        should(calls).eql([
            "WhenRoot called: Destroyed",
            "Action0 called",
            "When0 called: Destroyed",
            "Action1 called",
            "When1 called: Destroyed",
            "Action2 called",
            "When2 called: Destroyed",
            "Action3 called",
            "When3 called: Destroyed",
        ]);
    });

    /**
     * Tests dependencies of children, including with function components.
     */
    async function createPlanD(goal: GoalStatus) {

        function createActions(dom: FinalDomElement, spy: SinonSpy) {
            const changeType = toChangeType(goal);
            const prims = domMap(dom, (e) => e).filter((e) => e.componentType === Prim);
            const actions: Action[] = prims.map((prim) => ({
                detail: `Action${prim.props.key}`,
                type: changeType,
                act: () => spy(`Action${prim.props.key} called`),
                changes: [{
                    detail: `Change${prim.props.key}`,
                    type: changeType,
                    element: prim,
                }]
            }));
            return actions;
        }

        const hB = handle();
        const orig =
            <Group key="root">
                <Func key="A" dep={hB} />
                <Func key="B" handle={hB} />
            </Group>;

        const deployBuild = await doBuild(orig, {
            deployID,
            deployOpID,
        });
        const deployDiff = domDiffElements([], deployBuild.mountedElements);
        const deploySpy = sinon.spy();
        const deployActions = createActions(deployBuild.dom, deploySpy);

        const deployPlan = createExecutionPlan({
            ...planOpts,
            actions: deployActions,
            diff: deployDiff,
            goalStatus: GoalStatus.Deployed,
            newDom: deployBuild.dom,
        });

        if (!isExecutionPlanImpl(deployPlan)) throw new Error(`Not ExecutionPlanImpl`);

        // Deployed plan should have 7 Primitive + 6 non-Primitive + 4 Action
        let expAllNodes = 17;
        // The 4 Primitive components associated with actions are not active.
        let expNodes = 13;
        let expElems = 9;

        should(deployPlan.allNodes).have.length(expAllNodes);
        should(deployPlan.nodes).have.length(expNodes);
        should(deployPlan.elems).have.length(expElems);
        // Primitive deps from the original plan get saved for the reanimated plan
        const savedDeps = deployPlan.primitiveDependencies;
        should(savedDeps).eql({
            [`["root","A","AGroup"]`]: [
                `["root","B","BGroup"]`,
                `["root","B","BGroup","B1","B1-Prim"]`,
                `["root","B","BGroup","B2","B2-Prim"]`,
            ],
        });

        if (goal === GoalStatus.Deployed) {
            return {
                mountedElements: deployBuild.mountedElements,
                expAllNodes,
                plan: deployPlan,
                spy: deploySpy,
            };
        }

        const domXml = serializeDom(deployBuild.dom, { reanimateable: true });
        const zombie = await reanimateDom(domXml, deployID, deployOpID);
        if (!zombie) throw new Error(`Reanimated DOM should not build to null`);
        const destroyBuild = await doBuild(zombie, {
            deployID,
            deployOpID,
        });
        const destroyDiff = domDiffElements(destroyBuild.mountedElements, []);

        // The reanimated build should only have primiive elements
        const nonPrim = destroyBuild.mountedElements.filter((el) => !isPrimitiveElement(el));
        should(nonPrim).have.length(0);

        const destroySpy = sinon.spy();
        const destroyActions = createActions(destroyBuild.dom, destroySpy);

        const destroyPlan = createExecutionPlan({
            ...planOpts,
            actions: destroyActions,
            dependencies: savedDeps,
            diff: destroyDiff,
            goalStatus: GoalStatus.Destroyed,
            newDom: destroyBuild.dom,
        });

        if (!isExecutionPlanImpl(destroyPlan)) throw new Error(`Not ExecutionPlanImpl`);

        // 7 Primitive + 0 non-Primitive + 4 Action
        expAllNodes = 11;
        // The 4 Primitive nodes associated with actions are not active
        expNodes = 7;
        expElems = 3;

        should(destroyPlan.allNodes).have.length(expAllNodes);
        should(destroyPlan.nodes).have.length(expNodes);
        should(destroyPlan.elems).have.length(expElems);

        // Dependencies are reversed because we're destroying. We get all
        // combinations of primitive elements because the primitiveDependencies
        // from deployPlan has the pruned dependencies (i.e. one to many) but we
        // then reverse those in the destroyPlan, so they become many-to-many.
        should(destroyPlan.primitiveDependencies).eql({
            [`["root","B","BGroup"]`]: [
                `["root","A","AGroup"]`,
                `["root","A","AGroup","A1","A1-Prim"]`,
                `["root","A","AGroup","A2","A2-Prim"]`,
            ],
            [`["root","B","BGroup","B1","B1-Prim"]`]: [
                `["root","A","AGroup"]`,
                `["root","A","AGroup","A1","A1-Prim"]`,
                `["root","A","AGroup","A2","A2-Prim"]`,
            ],
            [`["root","B","BGroup","B2","B2-Prim"]`]: [
                `["root","A","AGroup"]`,
                `["root","A","AGroup","A1","A1-Prim"]`,
                `["root","A","AGroup","A2","A2-Prim"]`,
            ],
        });

        return {
            mountedElements: destroyBuild.mountedElements,
            expAllNodes,
            plan: destroyPlan,
            spy: destroySpy,
        };
    }

    it("Should deploy plan with function component dependencies (PlanD)", async () => {
        const goal: GoalStatus = DeployStatus.Deployed;
        const { mountedElements, expAllNodes, plan, spy } = await createPlanD(goal);

        should(dependencies(plan, { type: DependencyType.FinishStart, ...dependOpts })).eql({
            [`["root","A"]`]:                         [`["root","B"]`],
        });
        should(dependencies(plan, { type: DependencyType.StartStart, ...dependOpts })).eql({
            [`["root","A"]`]:                         [`["root"]`],
            [`["root","A","AGroup"]`]:                [`["root","A"]`],
            [`["root","A","AGroup","A1"]`]:           [`["root","A","AGroup"]`],
            [`["root","A","AGroup","A2"]`]:           [`["root","A","AGroup"]`],
            [`["root","B"]`]:                         [`["root"]`],
            [`["root","B","BGroup"]`]:                [`["root","B"]`],
            [`["root","B","BGroup","B1"]`]:           [`["root","B","BGroup"]`],
            [`["root","B","BGroup","B2"]`]:           [`["root","B","BGroup"]`],
            "ActionA1-Prim":                          [`["root","A","AGroup","A1"]`],
            "ActionA2-Prim":                          [`["root","A","AGroup","A2"]`],
            "ActionB1-Prim":                          [`["root","B","BGroup","B1"]`],
            "ActionB2-Prim":                          [`["root","B","BGroup","B2"]`],
        });

        should(plan.leaves).have.length(1); // "root"

        plan.check();
        const ret = await execute({ ...executeOpts, plan });

        await checkFinalSimple(plan, ret, goal,
            TaskState.Complete, mountedElements, expAllNodes, [
                "Group",    // root
                "Func",     // A
                "Func",     // B
                "Group",    // AGroup
                "Group",    // BGroup
                "MakePrim", // A1
                "MakePrim", // A2
                "MakePrim", // B1
                "MakePrim", // B2
                "ChangeA1-Prim",
                "ChangeA2-Prim",
                "ChangeB1-Prim",
                "ChangeB2-Prim",
            ]);

        const { stdout, stderr } = logger;
        should(stdout).eql(
`INFO: Doing ActionB1-Prim
INFO: Doing ActionB2-Prim
INFO: Doing ActionA1-Prim
INFO: Doing ActionA2-Prim
`);
        should(stderr).equal("");

        const calls = spyArgs(spy, 0);
        should(calls).eql([
            "ActionB1-Prim called",
            "ActionB2-Prim called",
            "ActionA1-Prim called",
            "ActionA2-Prim called",
        ]);
    });

    it("Should destroy plan with function component dependencies (PlanD)", async () => {
        const goal: GoalStatus = DeployStatus.Destroyed;
        const { mountedElements, expAllNodes, plan, spy } = await createPlanD(goal);

        // No FinishStart deps from the reanimated DOM
        should(dependencies(plan, { type: DependencyType.FinishStart, ...dependOpts })).eql({
        });
        // The saved prmitive dependency gets created as a FinishStartHard
        should(dependencies(plan, { type: DependencyType.FinishStartHard, ...dependOpts })).eql({
            [`["root","B","BGroup"]`]:                [`["root","A","AGroup"]`],
            "ActionB1-Prim":                          [`["root","A","AGroup"]`],
            "ActionB2-Prim":                          [`["root","A","AGroup"]`],
        });
        should(dependencies(plan, { type: DependencyType.StartStart, ...dependOpts })).eql({
            [`["root","A","AGroup"]`]:                [`["root"]`],
            [`["root","B","BGroup"]`]:                [`["root"]`],
            "ActionA1-Prim":                          [`["root","A","AGroup"]`],
            "ActionA2-Prim":                          [`["root","A","AGroup"]`],
            "ActionB1-Prim":                          [`["root","B","BGroup"]`],
            "ActionB2-Prim":                          [`["root","B","BGroup"]`],
        });

        should(plan.leaves).have.length(1); // "root"

        plan.check();
        const ret = await execute({ ...executeOpts, plan });

        await checkFinalSimple(plan, ret, goal,
            TaskState.Complete, mountedElements, expAllNodes, [
                "Group",    // root
                "Group",    // AGroup
                "Group",    // BGroup
                "ChangeA1-Prim",
                "ChangeA2-Prim",
                "ChangeB1-Prim",
                "ChangeB2-Prim",
            ]);

        const { stdout, stderr } = logger;
        should(stdout).eql(
`INFO: Doing ActionA1-Prim
INFO: Doing ActionA2-Prim
INFO: Doing ActionB1-Prim
INFO: Doing ActionB2-Prim
`);
        should(stderr).equal("");

        const calls = spyArgs(spy, 0);
        should(calls).eql([
            "ActionA1-Prim called",
            "ActionA2-Prim called",
            "ActionB1-Prim called",
            "ActionB2-Prim called",
        ]);
    });

    // Tests that if an Action is acting on behalf of multiple Elements and
    // those Elements had dependencies between them, that those dependencies
    // are correctly collapsed (removed) into the single Action. This test
    // has one Action that handles 3 elements and another one that handles 2.
    it("Should collapse dependencies between elements that share an Action", async () => {
        const goalStatus: GoalStatus = DeployStatus.Deployed;
        const hands = [ handle(), handle(), handle(), handle(), handle() ];
        // Dependencies: kid0 -> kid1 -> kid2 -> kid3 -> kid4
        const deps: DependsOnMethod[] = [
            (_gs, h) => makeAllOf("deps0", h, [ hands[1] ]),
            (_gs, h) => makeAllOf("deps1", h, [ hands[2] ]),
            (_gs, h) => makeAllOf("deps2", h, [ hands[3] ]),
            (_gs, h) => makeAllOf("deps3", h, [ hands[4] ]),
        ];
        const dep = (id: number, gs: GoalStatus, h: DeployHelpers) => deps[id](gs, h);
        const orig =
            <Group key="root">
                <DependPrim key="0" id={0} handle={hands[0]} dep={dep} />
                <DependPrim key="1" id={1} handle={hands[1]} dep={dep} />
                <DependPrim key="2" id={2} handle={hands[2]} dep={dep} />
                <DependPrim key="3" id={3} handle={hands[3]} dep={dep} />
                <DependPrim key="4" id={4} handle={hands[4]} />
            </Group>;
        const { mountedElements, dom } = await doBuild(orig);
        const kids: FinalDomElement[] = dom.props.children;

        const spy = sinon.spy();
        const changeType = toChangeType(goalStatus);
        const actions: Action[] = [
            // Action for kid0, kid1, kid2
            {
                detail: "Action0",
                type: changeType,
                act: () => spy(`Action0 called`),
                changes: kids.slice(0, 3).map((k) => ({
                    detail: `Change${k.props.id}`,
                    type: changeType,
                    element: k,
                })),
            },
            // Action for kid3, kid4
            {
                detail: "Action1",
                type: changeType,
                act: () => spy(`Action1 called`),
                changes: kids.slice(3).map((k) => ({
                    detail: `Change${k.props.id}`,
                    type: changeType,
                    element: k,
                })),
            },
        ];

        const plan = createExecutionPlan({
            ...implOpts,
            actions,
            dependencies: {},
            diff: toDiff(mountedElements, goalStatus),
            goalStatus,
            newDom: goalStatus === DeployStatus.Deployed ? dom : null,
        });

        if (!isExecutionPlanImpl(plan)) throw new Error(`Not ExecutionPlanImpl`);

        // Group + 5 kids + 2 actions
        should(plan.allNodes).have.length(8);
        // Group + 2 actions
        should(plan.nodes).have.length(3);
        // Group
        should(plan.elems).have.length(1);
        const savedDeps = plan.primitiveDependencies;
        should(savedDeps).eql({
            [`["root","0"]`]: [`["root","1"]`],
            [`["root","1"]`]: [`["root","2"]`],
            [`["root","2"]`]: [`["root","3"]`],
            [`["root","3"]`]: [`["root","4"]`],
        });

        // This is the key test. There should be only one dependency remaining
        // between the two Actions.
        should(dependencies(plan, { type: DependencyType.FinishStart, ...dependOpts })).eql({
            Action0: [ "Action1" ],
        });
        should(dependencies(plan, { type: DependencyType.StartStart, ...dependOpts })).eql({
            Action0: [ `["root"]` ],
            Action1: [ `["root"]` ],
        });
    });

});

describe("Execution plan state", () => {
    let dep: MockDeploy;
    const deployOpts: DeployOptions = {
        once: true,
    };

    mochaTmpdir.each("exec-plan-state");

    beforeEach(async () => {
        dep = new MockDeploy({
            pluginCreates: [ createActionStatePlugin ],
            tmpDir: process.cwd(),
        });
        await dep.init();
    });

    it("Should accept state changes during deploy", async () => {
        const spy = sinon.spy();
        const action = (comp: ActionState) => {
            spy("action called");
            comp.setState({ current: "one" });
        };
        const orig = <ActionState action={action} />;
        const { dom } = await dep.deploy(orig, deployOpts);
        if (dom == null) throw should(dom).not.be.Null();

        should(dep.stateStore.elementState(dom.keyPath)).eql({
            initial: "initial",
            current: "one",
        });
        should(spyArgs(spy, 0)).eql(["action called"]);
    });

    it("Should accept state changes even with error", async () => {
        const spy = sinon.spy();
        const action = (comp: ActionState) => {
            spy("action called");
            comp.setState({ current: "one" });
            throw new Error(`Error in action`);
        };
        const orig = <ActionState action={action} />;
        await should(dep.deploy(orig, { logError: false }))
            .be.rejectedWith("Errors encountered during plugin action phase");

        should(dep.stateStore.elementState(["ActionState"])).eql({
            initial: "initial",
            current: "one",
        });
        should(spyArgs(spy, 0)).eql(["action called"]);
    });

    it("Should accept state changes even with InternalError", async () => {
        const spy = sinon.spy();
        const action = (comp: ActionState) => {
            spy("action called");
            comp.setState({ current: "one" });
            throw new InternalError(`Error in action`);
        };
        const orig = <ActionState action={action} />;
        await should(dep.deploy(orig, { logError: false }))
            .be.rejectedWith("Internal Error: Error in action");

        should(dep.stateStore.elementState(["ActionState"])).eql({
            initial: "initial",
            current: "one",
        });
        should(spyArgs(spy, 0)).eql(["action called"]);
    });

    it("Should fail with UserError", async () => {
        const action = (comp: ActionState) => {
            throw new Error(`Normal error in action`);
        };
        const orig = <ActionState action={action} />;
        await should(dep.deploy(orig, { logError: false }))
            .be.rejectedWith("Errors encountered during plugin action phase");
    });

    it("Should fail with InternalError", async () => {
        const internal = (comp: ActionState) => {
            throw new InternalError(`InternalError in action`);
        };
        const normal = (comp: ActionState) => {
            throw new Error(`Error in action`);
        };
        const orig =
            <Group>
                <ActionState action={normal} />
                <ActionState action={internal} />
            </Group>;
        await should(dep.deploy(orig, { logError: false }))
            .be.rejectedWith("Internal Error: InternalError in action");
    });

    it("Should fail with multiple InternalErrors", async () => {
        const internal1 = (comp: ActionState) => {
            throw new InternalError(`InternalError1 in action`);
        };
        const internal2 = (comp: ActionState) => {
            throw new InternalError(`InternalError2 in action`);
        };
        const orig =
            <Group>
                <ActionState action={internal1} />
                <ActionState action={internal2} />
            </Group>;
        await should(dep.deploy(orig, { logError: false }))
            .be.rejectedWith(`Errors:
Internal Error: InternalError1 in action
Internal Error: InternalError2 in action`);
    });
});

describe("Execution plan restart", () => {
    let dep: MockDeploy;
    const deployOpts: DeployOptions = {
        once: true,
    };

    mochaTmpdir.each("exec-plan-restart");

    beforeEach(async () => {
        dep = new MockDeploy({
            pluginCreates: [ createActionStatePlugin ],
            tmpDir: process.cwd(),
        });
        await dep.init();
    });

    it("Should iterate deploys with state change", async () => {
        let spy = sinon.spy();
        let buildNum = 0;
        const action = (comp: ActionState) => {
            spy(`action${comp.props.id}`);
            if (buildNum === comp.props.id) {
                comp.setState({ deployed: true });
            }
        };
        const when = (id: number, _gs: GoalStatus, comp: ActionState): WaitStatus => {
            spy(`when${id} build=${buildNum} deployed=${comp.state.deployed}`);
            if (comp.state.deployed) return true;
            return {
                done: false,
                status: `deployed = ${comp.state.deployed}`
            };
        };

        const orig =
            <ActionState id={0} action={action} when={when}>
                <ActionState id={1} action={action} when={when} />
                <ActionState id={2} action={action} when={when} />
            </ActionState>;

        while (buildNum < 4) {
            const results = await dep.deploy(orig, deployOpts);
            if (results.dom == null) throw should(results.dom).not.be.Null();

            const expComplete = buildNum === 3;
            const expChanged = buildNum < 3;
            should(results.deployComplete).equal(expComplete);
            should(results.stateChanged).equal(expChanged);

            const elems: FinalDomElement[] = [ results.dom, ...results.dom.props.children ];
            should(elems).have.length(3);
            elems.forEach((e) => {
                const expState: ActionStateState = { initial: "initial" };
                if (buildNum >= e.props.id) expState.deployed = true;
                should(dep.stateStore.elementState(e.keyPath)).eql(expState);
            });

            // One element deploys each build loop, starting with buildNum 1
            const eStat = (id: number) => ({
                [elems[id].id]: {
                    deployStatus: buildNum > id ? DeployStatus.Deployed : DeployStatus.Deploying
                }
            });
            // All elements should be deployed when buildNum === 3
            const deployStatus = buildNum === 3 ? DeployOpStatus.Deployed : DeployOpStatus.StateChanged;
            const depStat = await dep.deployment.status(results.stepID);
            should(depStat).eql({
                deployStatus,
                goalStatus: DeployStatus.Deployed,
                elementStatus: {
                    ...eStat(0),
                    ...eStat(1),
                    ...eStat(2),
                }
            });

            const whenSpy = (id: number) => {
                const depVal = buildNum > id ? "true" : "undefined";
                return `when${id} build=${buildNum} deployed=${depVal}`;
            };

            const expSpyArgs = [];

            if (buildNum <= 0) expSpyArgs.push("action0");
            if (buildNum <= 1) expSpyArgs.push("action1");
            if (buildNum <= 2) expSpyArgs.push("action2");

            expSpyArgs.push(
                whenSpy(0),
                whenSpy(1),
                whenSpy(2),
            );

            should(spyArgs(spy, 0)).containDeep(expSpyArgs);

            buildNum++;
            spy = sinon.spy();
        }
    });
});

describe("Execution plan primitiveDependencies", () => {
    let deployment: Deployment;
    let deployID: string;
    let deployOpID: DeployOpID;
    let planOpts: Omit<ExecutionPlanOptions, "dependencies" | "diff" | "goalStatus" | "newDom">;
    let implOpts: Omit<ExecutionPlanImplOptions, "goalStatus">;

    beforeEach(async () => {
        deployment = await createMockDeployment();
        deployID = deployment.deployID;
        deployOpID = await deployment.newOpID();
        implOpts = {
            deployment,
            deployOpID,
        };
        planOpts = {
            ...implOpts,
            actions: [],
        };
    });

    async function getDependencies(orig: AdaptElement, savedDeps: EPPrimitiveDependencies = {}) {
        const { mountedElements, dom } = await doBuild(orig, {
            deployID,
            deployOpID,
        });

        const diff = domDiffElements([], mountedElements);
        const changeType = ChangeType.create;
        const prims = domMap(dom, (e) => e).filter((e) => e.componentType === DependPrim);
        const actions: Action[] = prims.map((prim) => ({
            detail: `Action${prim.props.key}`,
            type: changeType,
            act: () => Promise.resolve(),
            changes: [{
                detail: `Change${prim.props.key}`,
                type: changeType,
                element: prim,
            }]
        }));

        const plan = createExecutionPlan({
            ...planOpts,
            actions,
            dependencies: savedDeps,
            diff,
            goalStatus: GoalStatus.Deployed,
            newDom: dom,
        });

        if (!isExecutionPlanImpl(plan)) throw new Error(`Not ExecutionPlanImpl`);

        return plan.primitiveDependencies;
    }

    it("Should work with primitive components", async () => {
        const h = handle();
        const dep = (id: any, _: any, helpers: DeployHelpers) => helpers.dependsOn(h);
        const orig =
            <Group key="root">
                <DependPrim key="A" dep={dep} />
                <DependPrim key="B" handle={h} />
            </Group>;

        const deps = await getDependencies(orig);
        should(deps).eql({
            [`["root","A"]`]: [ `["root","B"]` ],
        });
    });

    it("Should work with functional component target", async () => {
        const h = handle();
        const dep = (id: any, _: any, helpers: DeployHelpers) => helpers.dependsOn(h);
        const orig =
            <Group key="root">
                <DependPrim key="A" dep={dep} />
                <MakeDependPrim key="B" handle={h} primProps={{ key: "C", id: 0 }} />
            </Group>;

        const deps = await getDependencies(orig);
        should(deps).eql({
            // Dependency on functional component transfers to its primitive child
            [`["root","A"]`]: [ `["root","B","C"]` ],
        });
    });

    it("Should work with functional component source", async () => {
        const h = handle();
        const dep = (id: any, _: any, helpers: DeployHelpers) => helpers.dependsOn(h);
        const orig =
            <Group key="root">
                <MakeDependPrim key="A" dep={dep} primProps={{ key: "C", id: 0 }} />
                <DependPrim key="B" handle={h} />
            </Group>;

        const deps = await getDependencies(orig);
        should(deps).eql({
            [`["root","A","C"]`]: [ `["root","B"]` ],
        });
    });

    it("Should work with functional components that build to children", async () => {
        const h = handle();
        const dep = (id: any, _: any, helpers: DeployHelpers) => helpers.dependsOn(h);
        const MakeGroup = ({ children }: WithChildren) => <Group>{children}</Group>;
        const MakeKidsB = () => (
            <MakeGroup key="MGB">
                <MakeDependPrim key="MDPB1" primProps={{ key: "DPB1", id: 0 }} />
                <MakeDependPrim key="MDPB1" primProps={{ key: "DPB2", id: 0 }} />
            </MakeGroup>
        );
        const orig =
            <Group key="root">
                <MakeDependPrim key="A" dep={dep} primProps={{ key: "C", id: 0 }} />
                <MakeKidsB key="B" handle={h} />
            </Group>;

        const deps = await getDependencies(orig);
        should(deps).eql({
            [`["root","A","C"]`]: [
                `["root","B","MGB","MGB-Group"]`,
                `["root","B","MGB","MGB-Group","MDPB1","DPB1"]`,
                `["root","B","MGB","MGB-Group","MDPB1","DPB2"]`,
            ],
        });
    });

    it("Should use saved primitive dependencies", async () => {
        const orig =
            <Group key="root">
                <DependPrim key="A" />
                <MakeDependPrim key="B" primProps={{ key: "C", id: 0 }} />
            </Group>;
        const savedDeps = { [`["root","A"]`]: [ `["root","B","C"]` ] };

        const deps = await getDependencies(orig, savedDeps);
        should(deps).eql(savedDeps);
    });
});
