import sinon from "sinon";

import Adapt, {
    AdaptMountedElement,
    domDiff,
    handle,
    Handle,
    PrimitiveComponent,
} from "../../src";
import {
    ChangeType,
    DependsOn,
    DeployHelpers,
    DeployStatus,
    GoalStatus,
    WaitStatus,
} from "../../src/deploy/deploy_types";

export interface IdProps {
    id: number;
}

export class Prim extends PrimitiveComponent<IdProps> { }

export interface DependProps {
    id: number;
    dep?: (id: number, goalStatus: GoalStatus, h: DeployHelpers) => DependsOn | undefined;
    when?: (id: number, goalStatus: GoalStatus) => WaitStatus | Promise<WaitStatus>;
}

export class DependPrim extends PrimitiveComponent<DependProps> {
    constructor(props: DependProps) {
        super(props);
        const when = props.when;
        if (when) this.deployedWhen = (gs: GoalStatus) => when(props.id, gs);
    }
    dependsOn = (goalStatus: GoalStatus, h: DeployHelpers) =>
        this.props.dep && this.props.dep(this.props.id, goalStatus, h)
}

export function MakePrim(props: IdProps) {
    return <Prim id={props.id} />;
}

export function spyArgs(spy: sinon.SinonSpy): any[][];
export function spyArgs(spy: sinon.SinonSpy, argNum: number): any[];
export function spyArgs(spy: sinon.SinonSpy, argNum?: number) {
    const args = spy.getCalls().map((call) => call.args);
    if (argNum === undefined) return args;
    return args.map((a) => a[argNum]);
}

export function makeHandles(count: number, namePrefix = "") {
    const ret: Handle[] = [];
    for (let i = 0; i < count; i++) {
        ret.push(handle(namePrefix + i));
    }
    return ret;
}

export const toChangeType = (goal: GoalStatus) =>
    goal === DeployStatus.Deployed ? ChangeType.create : ChangeType.delete;

export const toDiff = (dom: AdaptMountedElement, goal: GoalStatus) =>
    goal === DeployStatus.Deployed ? domDiff(null, dom) : domDiff(dom, null);
