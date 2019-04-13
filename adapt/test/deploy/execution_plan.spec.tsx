import { createMockLogger, MockLogger } from "@usys/testutils";
import { createTaskObserver, sleep, TaskObserver, TaskObserversUnknown, TaskState } from "@usys/utils";
import pDefer from "p-defer";
import should from "should";
import sinon from "sinon";

import Adapt, {
    Action,
    AdaptMountedElement,
    BuiltDomElement,
    ChangeType,
    DeployStatus,
    Group,
    handle,
} from "../../src/";
import { EPNode, ExecuteComplete, WaitInfo } from "../../src/deploy/deploy_types";
import {
    createExecutionPlan,
    execute,
    ExecutionPlanImpl,
} from "../../src/deploy/execution_plan";
import { domDiff } from "../../src/dom_utils";
import { Deployment } from "../../src/server/deployment";
import { DeploymentSequence, ElementStatusMap } from "../../src/server/deployment_data";
import { createMockDeployment } from "../server/mocks";
import { doBuild, Empty } from "../testlib";

interface IdProps {
    id: number;
}

class Prim extends Adapt.PrimitiveComponent<IdProps> { }

interface DependProps {
    id: number;
    dep: (id: number) => WaitInfo;
}

class DependPrim extends Adapt.PrimitiveComponent<DependProps> {
    dependsOn = () => this.props.dep(this.props.id);
}

/*
function MakePrim(props: IdProps) {
    return <Prim id={props.id} />;
}
*/

function spyArgs(spy: sinon.SinonSpy): any[][];
function spyArgs(spy: sinon.SinonSpy, argNum: number): any[];
function spyArgs(spy: sinon.SinonSpy, argNum?: number) {
    const args = spy.getCalls().map((call) => call.args);
    if (argNum === undefined) return args;
    return args.map((a) => a[argNum]);
}

describe("Execution plan", () => {
    it("Should create a plan", async () => {
        const d = <Empty id={1}/>;
        const { dom } = await doBuild(d);
        const plan = await createExecutionPlan({
            actions: [],
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
            </Group>;
        const { dom } = await doBuild(orig);
        const kids: BuiltDomElement[] = dom.props.children;
        const seriesActions = [0, 1].map((group) => kids.map((k, i): Action => ({
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
            actions: [],
            seriesActions,
            diff: domDiff(null, dom),
            goalStatus: DeployStatus.Deployed,
        });

        if (!(plan instanceof ExecutionPlanImpl)) {
            throw new Error(`plan is not an ExecutionPlanImpl`);
        }
        should(plan.elems).have.length(1 + kids.length);
        // GroupEl + kids * (1 elem + 2 series groups * 1 action)
        should(plan.nodes).have.length(1 + kids.length * 3);
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
    let sequence: DeploymentSequence;
    let taskObserver: TaskObserver;

    beforeEach(async () => {
        deployment = await createMockDeployment();
        sequence = await deployment.newSequence();
        logger = createMockLogger();
        taskObserver = createTaskObserver("parent", { logger });
    });

    function getTasks(): TaskObserversUnknown {
        return (taskObserver.childGroup() as any).tasks_;
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

        should(ret.deploymentStatus).equal(expDeploy);
        should(ret.nodeStatus).eql(makeNodeStatus(numNodes));
        should(ret.primStatus).eql(makeNodeStatus(expElems.length));

        // All plan nodes should be removed upon successful deploy
        should(plan.nodes).have.length(0);
        should(plan.elems).have.length(0);

        const { deployStatus, goalStatus, elementStatus } =
            await deployment.status(sequence);
        should(deployStatus).equal(expDeploy);
        should(goalStatus).equal(DeployStatus.Deployed);
        expElems.forEach((e) => checkElemStatus(elementStatus, e, expDeploy));

        const tasks = getTasks();
        const taskNames = Object.keys(tasks);
        should(taskNames).have.length(expTaskNames.length);
        should(taskNames).containDeep(expElems.map((e) => e.id));
        should(taskNames.map((n) => tasks[n]!.description)) .containDeep(expTaskNames);
        should(taskNames.map((n) => tasks[n]!.state))
            .containDeep(expTaskNames.map(() => expTask));
    }

    it("Should execute elements and actions", async () => {
        const plan = new ExecutionPlanImpl(DeployStatus.Deployed);
        const orig =
            <Group>
                <Prim id={0} />
                <Prim id={1} />
                <Prim id={2} />
            </Group>;
        const { dom } = await doBuild(orig);
        const kids: BuiltDomElement[] = dom.props.children;
        const elems = [ dom, ...kids ];

        elems.forEach((e) => plan.addElem(e));

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

        const expNodes = 7;
        should(plan.nodes).have.length(expNodes);
        should(plan.elems).have.length(4);
        should(plan.leaves).have.length(4);

        plan.check();
        const ret = await execute({
            deployment,
            logger,
            plan,
            sequence,
            taskObserver,
        });

        await checkFinalSimple(plan, ret, DeployStatus.Deployed,
            TaskState.Complete, elems, expNodes,
            ["Action0 Change0", "Action1 Change0", "Action2 Change0", "Group"]);

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

    it("Should wait for all dependencies", async () => {
        const plan = new ExecutionPlanImpl(DeployStatus.Deployed);
        const orig =
            <Group>
                <Prim id={0} />
                <Prim id={1} />
                <Prim id={2} />
                <Prim id={3} />
            </Group>;
        const { dom } = await doBuild(orig);
        const kids: BuiltDomElement[] = dom.props.children;
        const elems = [ dom, ...kids ];

        elems.forEach((e) => plan.addElem(e));

        plan.addDep(dom, kids[0]);
        plan.addDep(dom, kids[3]);

        should(plan.nodes).have.length(5);
        should(plan.elems).have.length(5);
        should(plan.leaves).have.length(4);

        const spy = sinon.spy();
        const waits: WaitInfo[] = [];
        for (let i = 0; i < 4; i++) {
            waits.push({
                description: `Action${i}`,
                status: () => ({ done: true }),
                action: () => spy(`Action${i} called`),
                logAction: true,
            });
        }
        waits.forEach((waitInfo, i) => {
            const n = { waitInfo };
            plan.addNode(n);
            plan.addDep(kids[i], n);
        });

        plan.addDep(waits[0], waits[1]);
        plan.addDep(waits[0], waits[2]);
        plan.addDep(waits[0], waits[3]);
        plan.addDep(waits[1], waits[2]);
        plan.addDep(waits[2], waits[3]);

        const expNodes = 9;
        should(plan.nodes).have.length(expNodes);
        should(plan.elems).have.length(5);
        should(plan.leaves).have.length(1);

        plan.check();
        const ret = await execute({
            deployment,
            logger,
            plan,
            sequence,
            taskObserver,
        });

        await checkFinalSimple(plan, ret, DeployStatus.Deployed,
            TaskState.Complete, elems, expNodes,
            ["Prim", "Prim", "Prim", "Prim", "Group"]);

        const { stdout, stderr } = logger;
        const lines = stdout.split("\n");
        should(lines).have.length(5);
        should(lines[0]).match(/Doing Action3/);
        should(lines[1]).match(/Doing Action2/);
        should(lines[2]).match(/Doing Action1/);
        should(lines[3]).match(/Doing Action0/);
        should(lines[4]).equal("");
        should(stderr).equal("");

        should(spy.callCount).equal(4); // 1 per action
        should(spy.getCall(0).args[0]).match(/Action3 called/);
        should(spy.getCall(1).args[0]).match(/Action2 called/);
        should(spy.getCall(2).args[0]).match(/Action1 called/);
        should(spy.getCall(3).args[0]).match(/Action0 called/);
    });

    it("Should fail with simple cycle", async () => {
        const plan = new ExecutionPlanImpl(DeployStatus.Deployed);
        const orig = <Group/>;
        const { dom } = await doBuild(orig);

        plan.addElem(dom);
        plan.addDep(dom, dom);

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
        const plan = new ExecutionPlanImpl(DeployStatus.Deployed);
        const orig =
            <Group>
                <Prim id={0} />
                <Prim id={1} />
                <Prim id={2} />
                <Prim id={3} />
            </Group>;
        const { dom } = await doBuild(orig);
        const kids: BuiltDomElement[] = dom.props.children;
        const elems = [ dom, ...kids ];

        elems.forEach((e) => plan.addElem(e));

        plan.addDep(dom, kids[0]);
        plan.addDep(kids[0], dom);
        plan.addDep(kids[1], kids[2]);
        plan.addDep(kids[2], kids[3]);
        plan.addDep(kids[3], kids[1]);

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

    it("Should fail dependents on error", async () => {
        const plan = new ExecutionPlanImpl(DeployStatus.Deployed);
        const orig =
            <Group>
                <Prim id={0} />
                <Prim id={1} />
                <Prim id={2} />
                <Prim id={3} />
            </Group>;
        const { dom } = await doBuild(orig);
        const kids: BuiltDomElement[] = dom.props.children;
        const elems = [ dom, ...kids ];

        elems.forEach((e) => plan.addElem(e));

        const actions: Action[] = [];
        for (let i = 0; i < 4; i++) {
            const act = i === 3 ?
                async () => { throw new Error(`Action error`); } :
                async () => { /**/ };
            actions.push({
                type: ChangeType.create,
                detail: `Action${i}`,
                act,
                changes: [
                    {
                        detail: `Action${i} Change0`,
                        type: ChangeType.create,
                        element: kids[i]
                    }
                ]
            });
        }
        actions.forEach((a) => plan.addAction(a));

        plan.addDep(kids[0], kids[1]);
        plan.addDep(kids[1], kids[2]);
        plan.addDep(kids[2], kids[3]);

        should(plan.nodes).have.length(9);
        should(plan.elems).have.length(5);
        should(plan.leaves).have.length(5);

        plan.check();
        const ret = await execute({
            deployment,
            logger,
            plan,
            sequence,
            taskObserver,
        });

        should(ret.deploymentStatus).equal(DeployStatus.Failed);
        should(ret.nodeStatus).eql({
            [DeployStatus.Deployed]: 4,
            [DeployStatus.Deploying]: 0,
            [DeployStatus.Failed]: 5,
            [DeployStatus.Initial]: 0,
            [DeployStatus.Waiting]: 0,
        });
        should(ret.primStatus).eql({
            [DeployStatus.Deployed]: 1,
            [DeployStatus.Deploying]: 0,
            [DeployStatus.Failed]: 4,
            [DeployStatus.Initial]: 0,
            [DeployStatus.Waiting]: 0,
        });

        const { stdout, stderr } = logger;
        const lines = stdout.split("\n");
        should(lines).have.length(5);
        should(stdout).match(/Doing Action0/);
        should(stdout).match(/Doing Action1/);
        should(stdout).match(/Doing Action2/);
        should(stdout).match(/Doing Action3/);
        should(lines[4]).equal("");
        should(stderr).match(/Error while Action3/);
        should(stderr).match(/Error: Action error/);

        const { deployStatus, goalStatus, elementStatus } =
            await deployment.status(sequence);
        should(deployStatus).equal(DeployStatus.Failed);
        should(goalStatus).equal(DeployStatus.Deployed);
        checkElemStatus(elementStatus, dom, DeployStatus.Deployed);
        checkElemStatus(elementStatus, kids[0], DeployStatus.Failed,
            /A dependency failed to deploy successfully/);
        checkElemStatus(elementStatus, kids[1], DeployStatus.Failed,
            /A dependency failed to deploy successfully/);
        checkElemStatus(elementStatus, kids[2], DeployStatus.Failed,
            /A dependency failed to deploy successfully/);
        checkElemStatus(elementStatus, kids[3], DeployStatus.Failed,
            /Action error/);

        const tasks = getTasks();
        const taskNames = Object.keys(tasks);
        should(taskNames).containDeep([dom.id, ...kids.map((k) => k.id)]);
        should(taskNames.map((n) => tasks[n]!.description))
            .containDeep(["Group", "Action0 Change0", "Action1 Change0", "Action2 Change0", "Action3 Change0"]);
        should(taskNames.map((n) => tasks[n]!.state))
            .containDeep([TaskState.Complete, TaskState.Failed, TaskState.Failed, TaskState.Failed]);
    });

    it("Should time out", async () => {
        const timeoutMs = 100;
        const plan = new ExecutionPlanImpl(DeployStatus.Deployed);
        const orig =
            <Group>
                <Prim id={0} />
                <Prim id={1} />
                <Prim id={2} />
                <Prim id={3} />
                <Prim id={4} />
            </Group>;
        const { dom } = await doBuild(orig);
        const kids: BuiltDomElement[] = dom.props.children;
        const spy = sinon.spy();

        // Add all the elems, with one Action per Prim. And add dependencies
        // to make the Actions sequential. Actions 0 and 1 return immediately
        // but the rest take more time than the execute timeout.
        let prev: EPNode | undefined;
        plan.addElem(dom);
        kids.forEach((k, i) => {
            plan.addElem(k);
            const a = plan.addAction({
                type: ChangeType.create,
                detail: `Action${i}`,
                act: i > 1 ?
                    async () => {
                        spy(`Action${i}`);
                        await sleep(timeoutMs * 2);
                    }
                    :
                    async () => spy(`Action${i}`),
                changes: [{
                    detail: `Action${i} Change0`,
                    type: ChangeType.create,
                    element: k
                }]
            });
            if (prev) plan.addDep(a, prev);
            prev = a;
        });

        should(plan.nodes).have.length(11);
        should(plan.elems).have.length(6);
        should(plan.leaves).have.length(2);

        plan.check();
        const ret = await execute({
            deployment,
            logger,
            plan,
            sequence,
            timeoutMs,
            taskObserver,
        });

        should(ret.deploymentStatus).equal(DeployStatus.Failed);
        should(ret.nodeStatus).eql({
            [DeployStatus.Deployed]: 5,
            [DeployStatus.Deploying]: 0,
            [DeployStatus.Failed]: 6,
            [DeployStatus.Initial]: 0,
            [DeployStatus.Waiting]: 0,
        });
        should(ret.primStatus).eql({
            [DeployStatus.Deployed]: 3,
            [DeployStatus.Deploying]: 0,
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
            await deployment.status(sequence);
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
        const plan = new ExecutionPlanImpl(DeployStatus.Deployed);
        const orig =
            <Group>
                <Prim id={0} />
                <Prim id={1} />
                <Prim id={2} />
            </Group>;
        const { dom } = await doBuild(orig);
        const kids: BuiltDomElement[] = dom.props.children;

        plan.addElem(dom);
        plan.addElem(kids[0]);
        plan.addElem(kids[1]);
        plan.addElem(kids[2]);
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

        const beforeStatus = await deployment.status(sequence);

        plan.check();
        const ret = await execute({
            deployment,
            dryRun: true,
            logger,
            plan,
            sequence,
            taskObserver,
        });

        should(ret.deploymentStatus).equal(DeployStatus.Deployed);
        should(ret.nodeStatus).eql({
            [DeployStatus.Deployed]: 7,
            [DeployStatus.Deploying]: 0,
            [DeployStatus.Failed]: 0,
            [DeployStatus.Initial]: 0,
            [DeployStatus.Waiting]: 0,
        });
        should(ret.primStatus).eql({
            [DeployStatus.Deployed]: 4,
            [DeployStatus.Deploying]: 0,
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

        const afterStatus = await deployment.status(sequence);
        should(afterStatus).deepEqual(beforeStatus);

        const tasks = getTasks();
        const taskNames = Object.keys(tasks);
        should(taskNames).containDeep([dom.id, ...kids.map((k) => k.id)]);
        should(taskNames.map((n) => tasks[n]!.description))
            .containDeep(["Action0 Change0", "Action1 Change0", "Action2 Change0", "Group"]);
        should(taskNames.map((n) => tasks[n]!.state))
            .containDeep([TaskState.Skipped, TaskState.Skipped, TaskState.Skipped, TaskState.Skipped]);
    });

    it("Should mark elements Deploying while actions run", async () => {
        const plan = new ExecutionPlanImpl(DeployStatus.Deployed);
        const orig =
            <Group>
                <Prim id={0} />
                <Prim id={1} />
                <Prim id={2} />
            </Group>;
        const { dom } = await doBuild(orig);
        const kids: BuiltDomElement[] = dom.props.children;
        const elems = [ dom, ...kids ];

        elems.forEach((e) => plan.addElem(e));

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
            const s = await deployment.status(sequence);
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
                status: () => ({ done: true }),
                action: async () => actionCheck(i),
                actingFor: [{
                    type: ChangeType.create,
                    element: kids[i],
                    detail: `Creating Action${i}`,
                }],
                logAction: true,
            };
            waits.push(w);
            plan.addWaitInfo(w);
            plan.addDep(kids[i], w);
        }
        waits.forEach((w) => plan.addWaitInfo(w));

        // Execution order: 2, 0, 1
        plan.addDep(waits[1], waits[0]);
        plan.addDep(waits[0], waits[2]);

        const expNodes = 7;
        should(plan.nodes).have.length(expNodes);
        should(plan.elems).have.length(4);
        should(plan.leaves).have.length(2);

        plan.check();
        const ret = await execute({
            deployment,
            logger,
            plan,
            sequence,
            taskObserver,
        });

        await checkFinalSimple(plan, ret, DeployStatus.Deployed,
            TaskState.Complete, elems, expNodes,
            ["Creating Action0", "Creating Action1", "Creating Action2", "Group"]);

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

    it("Should give unassociated handle error", async () => {
        const plan = new ExecutionPlanImpl(DeployStatus.Deployed);
        const h = handle();
        const w: WaitInfo = {
            description: `desc`,
            status: () => ({ done: true }),
            dependsOn: [ h ]
        };
        const dep = () => w;

        const orig =
            <Group>
                <DependPrim id={0} dep={dep}/>
            </Group>;
        const { dom } = await doBuild(orig);

        plan.addElem(dom);
        plan.addElem(dom.props.children);

        const errRE = RegExp(
            `A Component dependsOn method returned a DependsOn ` +
            `object 'desc' that contains ` +
            `a Handle that is not associated with any Element`);
        should(() => plan.updateElemDepends()).throwError(errRE);
    });

    it("Should check primitive element dependsOn", async () => {
        const plan = new ExecutionPlanImpl(DeployStatus.Deployed);
        const spy = sinon.spy();
        const hands = [ handle(), handle(), handle() ];
        const waits = hands.map<WaitInfo>((_h, i) => ({
            description: `wait${i}`,
            status: () => { spy(`status${i}`); return { done: true }; },
            action: () => spy(`wait action${i}`),
            dependsOn: i > 1 ? [] : [ hands[i + 1] ],
        }));
        const dep = (id: number) => waits[id];

        const orig =
            <Group>
                <DependPrim id={0} dep={dep} handle={hands[0]} />
                <DependPrim id={1} dep={dep} handle={hands[1]} />
                <DependPrim id={2} dep={dep} handle={hands[2]} />
            </Group>;
        const { dom } = await doBuild(orig);
        const kids: BuiltDomElement[] = dom.props.children;
        const elems = [ dom, ...kids ];

        elems.forEach((e) => plan.addElem(e));

        should(plan.nodes).have.length(4);
        should(plan.elems).have.length(4);
        should(plan.leaves).have.length(4);

        const acts = sequentialActs([0, 1, 2], spy);
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

        const expNodes = 7;
        should(plan.nodes).have.length(expNodes);
        should(plan.elems).have.length(4);
        should(plan.leaves).have.length(4);

        plan.updateElemDepends();

        // Each WaitInfo should attach to it's Element's node
        should(plan.nodes).have.length(7);
        should(plan.elems).have.length(4);
        should(plan.leaves).have.length(4);

        plan.check();
        const ret = await execute({
            deployment,
            logger,
            plan,
            sequence,
            taskObserver,
        });

        await checkFinalSimple(plan, ret, DeployStatus.Deployed,
            TaskState.Complete, elems, expNodes,
            ["Action0 Change0", "Action1 Change0", "Action2 Change0", "Group"]);

        const { stdout, stderr } = logger;
        should(stderr).equal("");
        const lines = stdout.split("\n");
        // Actions could happen in any order
        should(lines[0]).match(/Doing Action\d/);
        should(lines[1]).match(/Doing Action\d/);
        should(lines[2]).match(/Doing Action\d/);
        should(lines[3]).match("");

        should(spy.callCount).equal(12); // 3 elems * 4 calls per elem
        const calls = spyArgs(spy, 0);
        // Starts can happen in any order, but all before any completions
        should(calls[0]).match(/Action\d started/);
        should(calls[1]).match(/Action\d started/);
        should(calls[2]).match(/Action\d started/);
        should(calls.slice(3)).eql([
            "Action0 completed",
            "Action1 completed",
            "Action2 completed",
            "wait action2",
            "status2",
            "wait action1",
            "status1",
            "wait action0",
            "status0",
        ]);
    });
});
