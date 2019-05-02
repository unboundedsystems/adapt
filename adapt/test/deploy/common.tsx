import sinon from "sinon";

import Adapt, {
    AdaptMountedElement,
    BuiltinProps,
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
    when?: (id: number, goalStatus: GoalStatus, comp: DependPrim) => WaitStatus | Promise<WaitStatus>;
}

export class DependPrim
    <P extends DependProps = DependProps, S extends object = {}>
    extends PrimitiveComponent<P, S> {

    static defaultProps = { id: 0 };
    constructor(props: P & Partial<BuiltinProps>) {
        super(props);
        const when = props.when;
        if (when) this.deployedWhen = (gs: GoalStatus) => when(props.id, gs, this);
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
