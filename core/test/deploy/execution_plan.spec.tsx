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
import sinon from "sinon";

import Adapt, {
    Action,
    AdaptMountedElement,
    BuiltinProps,
    ChangeType,
    DeployStatus,
    FinalDomElement,
    Group,
    handle,
    Handle,
    isFinalDomElement,
} from "../../src/";
import {
    Dependency,
    DependsOn,
    DependsOnMethod,
    DeployHelpers,
    DeployOpStatus,
    ExecuteComplete,
    ExecuteOptions,
    ExecutionPlanOptions,
    GoalStatus,
    WaitStatus,
} from "../../src/deploy/deploy_types";
import {
    EPNode,
    isEPNodeWI,
    WaitInfo,
} from "../../src/deploy/deploy_types_private";
import {
    createExecutionPlan,
    EPDependency,
    execute,
    ExecutionPlanImpl,
    ExecutionPlanImplOptions,
    isExecutionPlanImpl,
} from "../../src/deploy/execution_plan";
import { relationIsReadyStatus, toRelation } from "../../src/deploy/relation_utils";
import { And } from "../../src/deploy/relations";
import { shouldTrackStatus } from "../../src/deploy/status_tracker";
import { noStateUpdates } from "../../src/dom";
import { domDiff } from "../../src/dom_utils";
import { InternalError } from "../../src/error";
import { Deployment } from "../../src/server/deployment";
import { DeployOpID, DeployStepID, ElementStatusMap } from "../../src/server/deployment_data";
import { createMockDeployment, DeployOptions, doBuild, Empty, MockDeploy } from "../testlib";
import { ActionState, ActionStateState, createActionStatePlugin } from "./action_state";
import {
    DependPrim,
    DependProps,
    MakeDependPrim,
    makeHandles,
    Prim,
    spyArgs,
    toChangeType,
    toDiff,
} from "./common";

function dependencies(plan: ExecutionPlanImpl) {
    const ret: { [ id: string]: string[] } = {};
    const epDeps = plan.toDependencies();
    const toDetail = (d: EPDependency) => epDeps[d.id].detail;
    Object.keys(epDeps).map((id) => {
        const ep = epDeps[id];
        ret[ep.detail] = ep.deps.map(toDetail).sort();
    });
    return ret;
}

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

const getHandles = (els: AdaptMountedElement[]) => els.map((el) => el.props.handle);

function addNodeWithWaitInfo(plan: ExecutionPlanImpl, el: AdaptMountedElement,
    deps: AdaptMountedElement[], gs: GoalStatus = DeployStatus.Deployed,
    checkReady?: AllOfTesterOptions["checkReady"]) {

    const helpers = plan.helpers.create(el);
    let node: EPNode = {
        element: el,
        goalStatus: gs,
    };
    plan.addNode(node);
    node = plan.getNode(node);
    node.waitInfo = {
        description: el.id,
        dependsOn: AllOfTester({
            description: "tester",
            helpers,
            deps: getHandles(deps),
            checkReady,
        }),
        deployedWhen: () => true,
    };
    if (!isEPNodeWI(node)) throw new Error("node is not EPNodeWI");
    plan.addWaitInfo(node, gs);
}

describe("Execution plan", () => {
    let deployment: Deployment;
    let deployOpID: DeployOpID;
    let planOpts: Omit<ExecutionPlanOptions, "diff" | "goalStatus">;

    beforeEach(async () => {
        deployment = await createMockDeployment();
        deployOpID = await deployment.newOpID();
        planOpts = {
            actions: [],
            builtElements: [],
            deployment,
            deployOpID,
        };
    });

    it("Should create a plan", async () => {
        const d = <Empty id={1}/>;
        const { dom } = await doBuild(d);
        const plan = await createExecutionPlan({
            ...planOpts,
            diff: domDiff(null, dom),
            goalStatus: DeployStatus.Deployed,
        });
        should(plan).not.be.Null();

        if (!(plan instanceof ExecutionPlanImpl)) {
            throw new Error(`plan is not an ExecutionPlanImpl`);
        }
        should(plan.elems).have.length(1);
        should(plan.leaves).have.length(1);
        should(plan.nodes).have.length(1);
    });

    it("Should create a plan with series actions", async () => {
        const orig =
            <Group>
                <Prim id={0} />
                <Prim id={1} />
                <Prim id={2} />
                <Prim id={3} />
                <Prim id={4} />
                <Prim id={5} />
            </Group>;
        const { dom } = await doBuild(orig);
        const kids: FinalDomElement[][] = [
            dom.props.children.slice(0, 3),
            dom.props.children.slice(3, 6),
        ];
        const nKids = dom.props.children.length;
        const seriesActions = [0, 1].map((group) => kids[group].map((k, i): Action => ({
            type: ChangeType.create,
            detail: `Group${group} Action${i}`,
            act: () => Promise.resolve(),
            changes: [
                {
                    detail: `Group${group} Action${i} Change0`,
                    type: ChangeType.create,
                    element: k
                }
            ]
        })));

        const plan = await createExecutionPlan({
            ...planOpts,
            seriesActions,
            diff: domDiff(null, dom),
            goalStatus: DeployStatus.Deployed,
        });

        if (!(plan instanceof ExecutionPlanImpl)) {
            throw new Error(`plan is not an ExecutionPlanImpl`);
        }
        should(plan.elems).have.length(1 + nKids);
        // GroupEl + kids * (1 elem + 1 action)
        should(plan.nodes).have.length(1 + nKids * 2);
        // GroupEl + 1 action from each series group
        should(plan.leaves).have.length(3);
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
    let deployOpID: DeployOpID;
    let planOpts: Omit<ExecutionPlanOptions, "diff" | "goalStatus">;
    let implOpts: Omit<ExecutionPlanImplOptions, "goalStatus">;

    beforeEach(async () => {
        deployment = await createMockDeployment();
        deployOpID = await deployment.newOpID();
        implOpts = {
            deployment,
            deployOpID,
        };
        planOpts = {
            ...implOpts,
            actions: [],
            builtElements: [],
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
     *   - Adding hard dependencies via plan.addAction
     *   - Hard dependencies
     * Dependencies (all hard):
     *   root -> (none)
     *   kid0 -> Action0
     *   kid1 -> Action1
     *   kid2 -> Action2
     */
    async function createPlan1(goalStatus: GoalStatus) {
        const plan = new ExecutionPlanImpl({ ...implOpts, goalStatus });
        const orig =
            <Group>
                <Prim id={0} />
                <Prim id={1} />
                <Prim id={2} />
            </Group>;
        const { dom } = await doBuild(orig);
        const kids: FinalDomElement[] = dom.props.children;
        const elems = [ dom, ...kids ];

        elems.forEach((e) => plan.addElem(e, goalStatus));

        should(plan.nodes).have.length(4);
        should(plan.elems).have.length(4);
        should(plan.leaves).have.length(4);

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
        actions.forEach((a) => plan.addAction(a));

        const expNodes = 7;
        should(plan.nodes).have.length(expNodes);
        should(plan.elems).have.length(4);

        return {
            dom,
            elems,
            expNodes,
            kids,
            plan,
            spy,
        };
    }

    it("Should deploy elements with actions (Plan1)", async () => {
        const goal = DeployStatus.Deployed;
        const { dom, elems, expNodes, kids, plan, spy } = await createPlan1(goal);
        should(plan.leaves).have.length(4);

        should(dependencies(plan)).eql({
            [dom.id]: [],
            [kids[0].id]: [ "Action0" ],
            [kids[1].id]: [ "Action1" ],
            [kids[2].id]: [ "Action2" ],
            Action0: [],
            Action1: [],
            Action2: [],
        });

        plan.check();
        const ret = await execute({ ...executeOpts, plan });

        await checkFinalSimple(plan, ret, goal, TaskState.Complete, elems, expNodes,
            ["Action0 Change0", "Action1 Change0", "Action2 Change0"]);

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
     * - Tests that group leaders (Actions) always happen before group
     *   members (Elements affected by the change), even during destroy when
     *   most dependencies reverse.
     */
    it("Should destroy elements with actions (Plan1)", async () => {
        const goal = DeployStatus.Destroyed;
        const { dom, elems, expNodes, kids, plan, spy } = await createPlan1(goal);

        should(plan.leaves).have.length(4);

        // The kids elements should ALWAYS depend on their Action (group leader),
        // even when destroying.
        should(dependencies(plan)).eql({
            [dom.id]: [],
            [kids[0].id]: [ "Action0" ],
            [kids[1].id]: [ "Action1" ],
            [kids[2].id]: [ "Action2" ],
            Action0: [],
            Action1: [],
            Action2: [],
        });

        plan.check();
        const ret = await execute({ ...executeOpts, plan });

        await checkFinalSimple(plan, ret, goal, TaskState.Complete, elems, expNodes,
            ["Action0 Change0", "Action1 Change0", "Action2 Change0"]);

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
     * Plan with a couple additional explicit hard dependencies between
     * elements. This uses addAction.
     * - Tests that dependencies on an Element in a group depend on that
     *   element in the deploy direction, but the group leader (Action) has
     *   the dependency in destroy.
     * - The depsBeforeActions flag tests the setGroup functionality of moving
     *   dependencies to the group leader when true.
     *
     * Dependencies (all hard. auto means via addAtion):
     *   root -> kid0, kid3
     *   kid0 -> Action0 (auto), kid1, kid2, kid3
     *   kid1 -> Action1 (auto), kid2
     *   kid2 -> Action2 (auto), kid3
     *   kid3 -> Action3 (auto)
     */
    async function createPlan2(goal: GoalStatus, depsBeforeActions = false) {
        const plan = new ExecutionPlanImpl({ ...implOpts, goalStatus: goal });
        const checkLeaves = (depl: number, dest: number, desc: string) => {
            const leaves = goal === DeployStatus.Deployed ? depl : dest;
            should(plan.leaves).have.length(leaves, desc);
        };
        const orig =
            <Group key="root">
                <Prim key="kid0" id={0} />
                <Prim key="kid1" id={1} />
                <Prim key="kid2" id={2} />
                <Prim key="kid3" id={3} />
            </Group>;
        const { dom } = await doBuild(orig);
        const kids: FinalDomElement[] = dom.props.children;
        const elems = [ dom, ...kids ];

        const addDeps = () => {
            plan.addHardDep(kids[0], kids[1]);
            plan.addHardDep(kids[0], kids[2]);
            plan.addHardDep(kids[0], kids[3]);
            plan.addHardDep(kids[1], kids[2]);
            plan.addHardDep(kids[2], kids[3]);
        };

        elems.forEach((e) => plan.addElem(e, goal));

        plan.addHardDep(dom, kids[0]);
        plan.addHardDep(dom, kids[3]);

        should(plan.nodes).have.length(5);
        should(plan.elems).have.length(5);
        checkLeaves(4, 3, "After nodes & 2 dependencies");

        if (depsBeforeActions) {
            addDeps();
            checkLeaves(1, 1, "deps before actions");
        }

        const spy = sinon.spy();
        const actions = kids.map((k, i) => ({
            type: toChangeType(goal),
            detail: `Action${i}`,
            act: () => spy(`Action${i} called`),
            changes: [
                {
                    detail: `Change${i}`,
                    type: toChangeType(goal),
                    element: k
                }
            ]
        }));
        actions.forEach((a) => plan.addAction(a));

        if (!depsBeforeActions) addDeps();

        const expNodes = 9;
        should(plan.nodes).have.length(expNodes);
        should(plan.elems).have.length(5);
        checkLeaves(1, 1, "plan complete");

        return {
            dom,
            elems,
            expNodes,
            kids,
            plan,
            spy,
        };
    }

    const deployPlan2 = (depsBeforeActions: boolean) => {
        it(`Should wait for hard dependencies in deploy (Plan2/${depsBeforeActions})`, async () => {

            const goal: GoalStatus = DeployStatus.Deployed;
            const { dom, elems, expNodes, kids, plan, spy } =
                await createPlan2(goal, depsBeforeActions);

            should(plan.leaves).have.length(1);

            should(dependencies(plan)).eql({
                [dom.id]: [ kids[0].id, kids[3].id ],
                [kids[0].id]: [ "Action0" ],
                [kids[1].id]: [ "Action1" ],
                [kids[2].id]: [ "Action2" ],
                [kids[3].id]: [ "Action3" ],
                // Dependencies between kids actually get placed on group leader
                // (Action)
                Action0: [ kids[1].id, kids[2].id, kids[3].id ],
                Action1: [ kids[2].id ],
                Action2: [ kids[3].id ],
                Action3: [],
            });

            plan.check();
            const ret = await execute({ ...executeOpts, plan });

            await checkFinalSimple(plan, ret, goal,
                TaskState.Complete, elems, expNodes,
                ["Group", "Change0", "Change1", "Change2", "Change3"]);

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
                "Action3 called",
                "Action2 called",
                "Action1 called",
                "Action0 called",
            ]);
        });
    };
    deployPlan2(false);  // Add actions, then deps
    deployPlan2(true);   // Add deps, then actions

    const destroyPlan2 = (depsBeforeActions: boolean) => {
        it(`Should wait for hard dependencies in destroy (Plan2/${depsBeforeActions})`, async () => {

            const goal: GoalStatus = DeployStatus.Destroyed;
            const { dom, elems, expNodes, kids, plan, spy } =
                await createPlan2(goal, depsBeforeActions);

            should(plan.leaves).have.length(1);

            should(dependencies(plan)).eql({
                [dom.id]: [],
                [kids[0].id]: [ "Action0" ],
                [kids[1].id]: [ "Action1" ],
                [kids[2].id]: [ "Action2" ],
                [kids[3].id]: [ "Action3" ],
                Action0: [ dom.id ],
                Action1: [ kids[0].id ],
                Action2: [ kids[0].id, kids[1].id ],
                Action3: [ kids[0].id, kids[2].id, dom.id ],
            });

            plan.check();
            const ret = await execute({ ...executeOpts, plan });

            await checkFinalSimple(plan, ret, goal,
                TaskState.Complete, elems, expNodes,
                ["Change0", "Change1", "Change2", "Change3"]);

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
                "Action0 called",
                "Action1 called",
                "Action2 called",
                "Action3 called",
            ]);
        });
    };
    destroyPlan2(false);  // Add actions, then deps
    destroyPlan2(true);   // Add deps, then actions

    it("Should wait for soft dependencies", async () => {
        const goal: GoalStatus = DeployStatus.Deployed;
        const plan = new ExecutionPlanImpl({ ...implOpts, goalStatus: goal });
        const orig =
            <Group>
                <Prim id={0} />
                <Prim id={1} />
                <Prim id={2} />
                <Prim id={3} />
            </Group>;
        const { dom } = await doBuild(orig);
        const kids: FinalDomElement[] = dom.props.children;
        const elems = [ dom, ...kids ];

        addNodeWithWaitInfo(plan, dom, [ kids[0], kids[3] ], goal);
        addNodeWithWaitInfo(plan, kids[0], [ kids[1], kids[2], kids[3] ], goal);
        addNodeWithWaitInfo(plan, kids[1], [ kids[2] ], goal);
        addNodeWithWaitInfo(plan, kids[2], [ kids[3] ], goal);
        addNodeWithWaitInfo(plan, kids[3], [], goal);

        should(plan.nodes).have.length(5);
        should(plan.elems).have.length(5);
        should(plan.leaves).have.length(1);

        const spy = sinon.spy();
        const acts = sequentialActs([3, 2, 1, 0], spy);
        const waits = acts.map<WaitInfo>((a, i) => ({
            description: `Action${i}`,
            action: a.act,
            logAction: true,
            deployedWhen: () => true,
            actingFor: [
                {
                    detail: `Action${i} Change0`,
                    type: ChangeType.create,
                    element: kids[i]
                }
            ]
        }));
        waits.forEach((w, i) => {
            const n = plan.addWaitInfo(w, goal);
            plan.addHardDep(kids[i], n);
        });

        const expNodes = 9;
        should(plan.nodes).have.length(expNodes);
        should(plan.elems).have.length(5);
        should(plan.leaves).have.length(4);

        should(dependencies(plan)).eql({
            [dom.id]: [ kids[0].id, kids[3].id ],
            [kids[0].id]: [ "Action0", kids[1].id, kids[2].id, kids[3].id ],
            [kids[1].id]: [ "Action1", kids[2].id ],
            [kids[2].id]: [ "Action2", kids[3].id ],
            [kids[3].id]: [ "Action3" ],
            Action0: [],
            Action1: [],
            Action2: [],
            Action3: [],
        });

        plan.check();
        const ret = await execute({ ...executeOpts, plan });

        await checkFinalSimple(plan, ret, goal,
            TaskState.Complete, elems, expNodes,
            ["Group", "Action0 Change0", "Action1 Change0", "Action2 Change0", "Action3 Change0"]);

        const { stdout, stderr } = logger;
        const lines = stdout.split("\n");
        should(lines).have.length(5);
        should(stdout).match(/Doing Action3/);
        should(stdout).match(/Doing Action2/);
        should(stdout).match(/Doing Action1/);
        should(stdout).match(/Doing Action0/);
        should(lines[4]).equal("");
        should(stderr).equal("");

        const calls = spyArgs(spy, 0);
        const starts = calls.slice(0, 4).sort(); // Starts can be in any order
        const rest = calls.slice(4);
        should(starts).eql([
            "Action0 started",
            "Action1 started",
            "Action2 started",
            "Action3 started",
        ]);
        should(rest).eql([
            "Action3 completed",
            "Action2 completed",
            "Action1 completed",
            "Action0 completed",
        ]);
    });

    it("Should fail with simple cycle", async () => {
        const goalStatus: GoalStatus = DeployStatus.Deployed;
        const plan = new ExecutionPlanImpl({ ...implOpts, goalStatus });
        const orig = <Group/>;
        const { dom } = await doBuild(orig);

        plan.addElem(dom, goalStatus);
        plan.addHardDep(dom, dom);

        should(plan.nodes).have.length(1);
        should(plan.elems).have.length(1);
        should(plan.leaves).have.length(0);
        try {
            plan.check();
            throw new Error("OOPS");
        } catch (err) {
            should(err.message).be.a.String();
            if (err.message === "OOPS") throw new Error(`plan.check() should have thrown but didn't`);

            should(err.message).equal(
                `There are circular dependencies present in this deployment:\n` +
                `  E:["Group"] -> E:["Group"]`);
        }
    });

    it("Should fail with larger cycles", async () => {
        const goal = DeployStatus.Deployed;
        const plan = new ExecutionPlanImpl({ ...implOpts, goalStatus: goal });
        const orig =
            <Group>
                <Prim id={0} />
                <Prim id={1} />
                <Prim id={2} />
                <Prim id={3} />
            </Group>;
        const { dom } = await doBuild(orig);
        const kids: FinalDomElement[] = dom.props.children;
        const elems = [ dom, ...kids ];

        elems.forEach((e) => plan.addElem(e, DeployStatus.Deployed));

        plan.addHardDep(dom, kids[0]);
        plan.addHardDep(kids[0], dom);
        plan.addHardDep(kids[1], kids[2]);
        plan.addHardDep(kids[2], kids[3]);
        plan.addHardDep(kids[3], kids[1]);

        should(plan.nodes).have.length(5);
        should(plan.elems).have.length(5);
        should(plan.leaves).have.length(0);
        try {
            plan.check();
            throw new Error("OOPS");
        } catch (err) {
            should(err.message).be.a.String();
            if (err.message === "OOPS") throw new Error(`plan.check() should have thrown but didn't`);

            should(err.message).equal(
                `There are circular dependencies present in this deployment:\n` +
                `  E:["Group","Prim"] -> E:["Group"] -> E:["Group","Prim"]\n` +
                `  E:["Group","Prim3"] -> E:["Group","Prim2"] -> E:["Group","Prim1"] -> E:["Group","Prim3"]`);
        }
    });

    it("Should fail with soft dependency cycle");

    /**
     * Tests that dependents fail when a node fails.
     * kid2 will throw an error.
     * Dependencies:
     *   kid0 -> kid1 (soft) - Tests hard cascading to soft
     *   kid1 -> kid2 (hard) - Tests immediate hard dependency
     *   kid2 -> kid3 (hard) - Tests that kid3 is unaffected by kid2 error
     *   kid3 -> (none)
     *   kid4 -> kid2 (soft) - Tests immediate soft dependency
     */
    it("Should fail dependents on error", async () => {
        const goal = DeployStatus.Deployed;
        const plan = new ExecutionPlanImpl({ ...implOpts, goalStatus: goal });

        const hands = makeHandles(5);
        const dep0 = (_i: number, _gs: GoalStatus, h: DeployHelpers) =>
            makeAllOf("kid0", h, [ hands[1] ]);
        const dep4 = (_i: number, _gs: GoalStatus, h: DeployHelpers) =>
            makeAllOf("kid4", h, [ hands[2] ]);
        const orig =
            <Group>
                <DependPrim id={0} handle={hands[0]} dep={dep0} />
                <DependPrim id={1} handle={hands[1]} />
                <DependPrim id={2} handle={hands[2]} />
                <DependPrim id={3} handle={hands[3]} />
                <DependPrim id={4} handle={hands[4]} dep={dep4} />
            </Group>;
        const { dom } = await doBuild(orig);
        const kids: FinalDomElement[] = dom.props.children;
        const elems = [ dom, ...kids ];

        elems.forEach((e) => plan.addElem(e, DeployStatus.Deployed));

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
        actions.forEach((a) => plan.addAction(a));

        plan.addHardDep(kids[1], kids[2]);
        plan.addHardDep(kids[2], kids[3]);

        plan.updateElemWaitInfo();

        // 6 elems + 5 actions
        should(plan.nodes).have.length(11);
        should(plan.elems).have.length(6);
        should(plan.leaves).have.length(2);

        plan.check();
        const ret = await execute({ ...executeOpts, plan });

        should(ret.deploymentStatus).equal(DeployStatus.Failed);
        should(ret.nodeStatus).eql({
            [DeployStatus.Deployed]: 3,
            [DeployStatus.Deploying]: 0,
            [DeployStatus.Destroyed]: 0,
            [DeployStatus.Destroying]: 0,
            [DeployStatus.Failed]: 8,
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
        checkElemStatus(elementStatus, dom, DeployStatus.Deployed);
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
        const plan = new ExecutionPlanImpl({ ...implOpts, goalStatus: goal });
        const orig =
            <Group>
                <Prim id={0} />
                <Prim id={1} />
                <Prim id={2} />
                <Prim id={3} />
                <Prim id={4} />
            </Group>;
        const { dom } = await doBuild(orig);
        const kids: FinalDomElement[] = dom.props.children;
        const spy = sinon.spy();

        // Add all the elems, with one Action per Prim. And add dependencies
        // to make the Actions sequential. Actions 0 and 1 return immediately
        // but the rest take more time than the execute timeout.
        let prev: EPNode | undefined;
        plan.addElem(dom, goal);
        kids.forEach((k, i) => {
            plan.addElem(k, goal);
            const a = plan.addAction({
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
            });
            if (prev && a) plan.addHardDep(a, prev);
            if (a) prev = a;
        });

        should(plan.nodes).have.length(11);
        should(plan.elems).have.length(6);
        should(plan.leaves).have.length(2);

        plan.check();
        const ret = await execute({ ...executeOpts, plan, timeoutMs: timeout });

        should(ret.deploymentStatus).equal(DeployStatus.Failed);
        should(ret.nodeStatus).eql({
            [DeployStatus.Deployed]: 5,
            [DeployStatus.Deploying]: 0,
            [DeployStatus.Destroyed]: 0,
            [DeployStatus.Destroying]: 0,
            [DeployStatus.Failed]: 6,
            [DeployStatus.Initial]: 0,
            [DeployStatus.Waiting]: 0,
        });
        should(ret.primStatus).eql({
            [DeployStatus.Deployed]: 3,
            [DeployStatus.Deploying]: 0,
            [DeployStatus.Destroyed]: 0,
            [DeployStatus.Destroying]: 0,
            [DeployStatus.Failed]: 3,
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
        checkElemStatus(elementStatus, dom, DeployStatus.Deployed);
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

        should(plan.nodes).have.length(7);
        should(plan.elems).have.length(4);
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

        const waits: WaitInfo[] = [];
        for (let i = 0; i < 3; i++) {
            const w: WaitInfo = {
                description: `Action${i}`,
                deployedWhen: () => true,
                action: async () => actionCheck(i),
                actingFor: [{
                    type: ChangeType.create,
                    element: kids[i],
                    detail: `Creating Action${i}`,
                }],
                logAction: true,
            };
            waits.push(w);
            plan.addWaitInfo(w, goal);
            plan.addHardDep(kids[i], w);
        }

        // Execution order: 2, 0, 1
        plan.addHardDep(waits[1], waits[0]);
        plan.addHardDep(waits[0], waits[2]);

        const expNodes = 7;
        should(plan.nodes).have.length(expNodes);
        should(plan.elems).have.length(4);
        should(plan.leaves).have.length(2);

        plan.check();
        const ret = await execute({ ...executeOpts, plan });

        await checkFinalSimple(plan, ret, DeployStatus.Deployed,
            TaskState.Complete, elems, expNodes,
            ["Creating Action0", "Creating Action1", "Creating Action2"]);

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

        plan.addElem(dom, goal);
        plan.addElem(dom.props.children, goal);

        const errRE = RegExp(
            `A Component dependsOn method returned a DependsOn ` +
            `object 'desc' that contains ` +
            `a Handle that is not associated with any Element`);
        should(() => plan.updateElemWaitInfo()).throwError(errRE);
    });

    it("Should check primitive element dependsOn", async () => {
        const goal: GoalStatus = DeployStatus.Deployed;
        const plan = new ExecutionPlanImpl({ ...implOpts, goalStatus: goal });
        const spy = sinon.spy();
        const hands = makeHandles(6);

        // Add the following dependencies:
        // These have hard deps on actions, so will only get notified
        // once hard deps are complete.
        //   kid0 -> kid1
        //   kid1 -> kid2
        //   kid2 -> -
        // These only have soft deps, so they'll get notified each time a
        // dep changes.
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
        const { dom } = await doBuild(orig);
        const kids: FinalDomElement[] = dom.props.children;
        const elems = [ dom, ...kids ];

        elems.forEach((e) => plan.addElem(e, goal));

        should(plan.nodes).have.length(7);
        should(plan.elems).have.length(7);
        // No dependencies yet
        should(plan.leaves).have.length(7);

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
        actions.forEach((a) => plan.addAction(a));

        const expNodes = 10;
        should(plan.nodes).have.length(expNodes);
        should(plan.elems).have.length(7);
        // Added 3 nodes, but also 3 dependencies
        should(plan.leaves).have.length(7);

        plan.updateElemWaitInfo();

        // Each WaitInfo should attach to it's Element's node - no new nodes
        should(plan.nodes).have.length(expNodes);
        should(plan.elems).have.length(7);
        // Only Action2 and Group are leaves
        should(plan.leaves).have.length(2);

        plan.check();
        const ret = await execute({ ...executeOpts, plan });

        await checkFinalSimple(plan, ret, DeployStatus.Deployed,
            TaskState.Complete, elems, expNodes,
            [
                "Action0 Change0", "Action1 Change0", "Action2 Change0",
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
        // an action completed. The checkReady calls in each group
        // are in non-deterministic order.
        const groups = makeActionGroups(calls);
        should(groups).have.length(4);

        should(groups[0][0]).equal("checkReady2 ready");

        should(groups[1][0]).equal("Action2 completed");
        should(groups[1].slice(1)).containDeep([
            "checkReady2 ready",
            "checkReady5 waiting",
        ]);

        should(groups[2][0]).equal("Action1 completed");
        should(groups[2].slice(1)).containDeep([
            "checkReady1 ready",
            "checkReady4 waiting",
            "checkReady5 waiting",
        ]);

        should(groups[3][0]).equal("Action0 completed");
        should(groups[3].slice(1)).containDeep([
            "checkReady0 ready",
            "checkReady3 ready",
            "checkReady4 ready",
            "checkReady5 ready",
        ]);
    });

    it("Should check non-primitive element dependsOn", async () => {
        const goal: GoalStatus = DeployStatus.Deployed;
        const plan = new ExecutionPlanImpl({ ...implOpts, goalStatus: goal });
        const spy = sinon.spy();
        const hand = handle();
        // The SFC depends on the primitive component
        const dep = (id: number, gStat: DeployStatus, h: DeployHelpers): DependsOn => {
            const deps: Handle[] = [];
            if (id === 0) deps.push(hand);
            return AllOfTester({
                description: `wait ${id}`,
                helpers: h,
                deps,
                checkReady: (stat) => {
                    spy(`${id} ready: ${stat}`);
                }
            });
        };
        const when = (id: number, gStat: GoalStatus): true => {
            spy(`${id} when: ${gStat}`);
            return true;
        };
        const primProps: DependProps & Partial<BuiltinProps> = {
            id: 1,
            dep,
            handle: hand,
            when,
        };

        const orig = <MakeDependPrim id={0} dep={dep} when={when} primProps={primProps} />;
        const { builtElements, dom } = await doBuild(orig);

        builtElements.forEach((e) => plan.addElem(e, goal));

        should(plan.nodes).have.length(2);
        should(plan.elems).have.length(2);
        // No dependencies yet
        should(plan.leaves).have.length(2);

        const action = {
            type: ChangeType.create,
            detail: `Action1`,
            act: async () => spy(`Action1 completed`),
            changes: [
                {
                    detail: `Change0`,
                    type: ChangeType.create,
                    element: dom
                }
            ]
        };
        plan.addAction(action);

        const expNodes = 3;
        should(plan.nodes).have.length(expNodes);
        should(plan.elems).have.length(2);
        // Primitive is dependent on Action
        should(plan.leaves).have.length(2);

        plan.updateElemWaitInfo();

        should(plan.nodes).have.length(expNodes);
        should(plan.elems).have.length(2);
        // Now there's a dependency between the two elements
        should(plan.leaves).have.length(1);

        plan.check();
        const ret = await execute({ ...executeOpts, plan });

        await checkFinalSimple(plan, ret, DeployStatus.Deployed,
            TaskState.Complete, builtElements, expNodes,
            [ "Change0", "MakeDependPrim" ]);

        const { stdout, stderr } = logger;
        should(stderr).equal("");
        const lines = stdout.split("\n");
        should(lines[0]).match(/Doing Action1/);
        should(lines[1]).match("");

        const calls: string[] = spyArgs(spy, 0);
        should(calls).eql([
            "1 ready: true",
            "Action1 completed",
            "1 ready: true",
            "1 when: Deployed",
            "0 ready: true",
            "0 when: Deployed",
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
        const plan = new ExecutionPlanImpl({ ...implOpts, goalStatus: goal });
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

        elems.forEach((e) => plan.addElem(e, goal));

        should(plan.nodes).have.length(3);
        should(plan.elems).have.length(3);
        should(plan.leaves).have.length(3);

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
        plan.addAction(action);

        // 3 elems in newDom, 1 action, 1 elem from oldDom
        const expNodes = 5;
        should(plan.nodes).have.length(expNodes);
        should(plan.elems).have.length(4);
        should(plan.leaves).have.length(2);

        plan.updateElemWaitInfo();

        // Number of nodes shouldn't change because the 3 new WaitInfos should
        // be attached to 3 existing elems
        should(plan.nodes).have.length(expNodes);
        should(plan.elems).have.length(4);
        should(plan.leaves).have.length(2);

        should(dependencies(plan)).eql({
            [newDom.id]: [],
            "new0 wait": [ "One Action" ],
            "new2 wait": [ "One Action" ],
            "old1 wait": [ "One Action" ],
            "One Action": [],
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
     * Dependencies (all soft except kid to its action):
     *  root -> kid0, kid3
     *  kid0 -> kid1, kid2, kid3, Action0 (h)
     *  kid1 -> kid2, Action1 (h)
     *  kid2 -> kid3, Action2 (h)
     *  kid3 -> Action3 (h)
     */
    async function createPlanC(goal: GoalStatus) {
        const spy = sinon.spy();
        const hands = makeHandles(5);
        const kHands = hands.slice(1);
        const deps: DependsOnMethod[] = [
            (_gs, h) => makeAllOf("depsRoot", h, [ kHands[0], kHands[3] ]),
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
        const { dom } = await doBuild(orig);
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

        const plan = await createExecutionPlan({
            ...planOpts,
            actions,
            diff: toDiff(dom, goal),
            goalStatus: goal,
        });

        if (!isExecutionPlanImpl(plan)) throw new Error(`Not ExecutionPlanImpl`);

        const expNodes = 9;
        should(plan.nodes).have.length(expNodes);
        should(plan.elems).have.length(5);

        return {
            elems,
            expNodes,
            kids,
            plan,
            spy,
        };
    }

    it("Should deploy plan with dependencies (PlanC)", async () => {
        const goal: GoalStatus = DeployStatus.Deployed;
        const { elems, expNodes, plan, spy } = await createPlanC(goal);

        should(dependencies(plan)).eql({
            depsRoot: [ "depsKid0", "depsKid3" ],
            depsKid0: [ "Action0" ],
            depsKid1: [ "Action1" ],
            depsKid2: [ "Action2" ],
            depsKid3: [ "Action3" ],
            Action0: [ "depsKid1", "depsKid2", "depsKid3" ],
            Action1: [ "depsKid2" ],
            Action2: [ "depsKid3" ],
            Action3: [],
        });

        should(plan.leaves).have.length(1);

        plan.check();
        const ret = await execute({ ...executeOpts, plan });

        await checkFinalSimple(plan, ret, goal,
            TaskState.Complete, elems, expNodes,
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
            "Action3 called",
            "When3 called: Deployed",
            "Action2 called",
            "When2 called: Deployed",
            "Action1 called",
            "When1 called: Deployed",
            "Action0 called",
            "When0 called: Deployed",
            "WhenRoot called: Deployed",
        ]);
    });

    it("Should destroy plan with dependencies (PlanC)", async () => {
        const goal: GoalStatus = DeployStatus.Destroyed;
        const { elems, expNodes, plan, spy } = await createPlanC(goal);

        should(dependencies(plan)).eql({
            depsRoot: [],
            depsKid0: [ "Action0" ],
            depsKid1: [ "Action1" ],
            depsKid2: [ "Action2" ],
            depsKid3: [ "Action3" ],
            Action0: [ "depsRoot" ],
            Action1: [ "depsKid0" ],
            Action2: [ "depsKid0", "depsKid1" ],
            Action3: [ "depsKid0", "depsKid2", "depsRoot" ],
        });

        should(plan.leaves).have.length(1);

        plan.check();
        const ret = await execute({ ...executeOpts, plan });

        await checkFinalSimple(plan, ret, goal,
            TaskState.Complete, elems, expNodes,
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
            throw new InternalError(`Error in action`);
        };
        const orig = <ActionState action={action} />;
        await should(dep.deploy(orig)).be.rejectedWith(/during plugin action/);

        should(dep.stateStore.elementState(["ActionState"])).eql({
            initial: "initial",
            current: "one",
        });
        should(spyArgs(spy, 0)).eql(["action called"]);
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
