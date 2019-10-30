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

import sinon from "sinon";

import Adapt, {
    AdaptMountedElement,
    BuiltinProps,
    domDiff,
    handle,
    Handle,
    PrimitiveComponent,
    useImperativeMethods,
    WithChildren,
} from "../../src";
import {
    ChangeType,
    DependsOn,
    DeployHelpers,
    DeployStatus,
    GoalStatus,
    WaitStatus,
} from "../../src/deploy/deploy_types";
import { EPDependencies, EPDependency, ExecutionPlanImpl } from "../../src/deploy/execution_plan";
import { GenericInstance } from "../../src/jsx";

export interface IdProps {
    id: number;
}

export class Prim extends PrimitiveComponent<IdProps> { }

export interface DependProps extends WithChildren {
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

export interface MakeDependProps extends DependProps {
    id: number;
    dep?: (id: number, goalStatus: GoalStatus, h: DeployHelpers) => DependsOn | undefined;
    when?: (id: number, goalStatus: GoalStatus) => WaitStatus | Promise<WaitStatus>;
    primProps: DependProps & Partial<BuiltinProps>;
}

export function MakeDependPrim(props: MakeDependProps) {
    const { dep, id, when } = props;
    const methods: GenericInstance = {};
    if (dep) methods.dependsOn = (gs, h) => dep(id, gs, h);
    if (when) methods.deployedWhen = (gs, h) => when(id, gs);

    useImperativeMethods(() => methods);
    return <DependPrim {...props.primProps} />;
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

export interface StringDependencies {
    [ id: string ]: string[];
}

export interface DependenciesOptions {
    key?: "id" | "detail";
}
const defaultDepOptions = {
    key: "detail",
};

export function dependencies(plan: ExecutionPlanImpl,
    options: DependenciesOptions = {}): StringDependencies {

    const { key } = { ...defaultDepOptions, ...options };
    const ret: StringDependencies = {};
    const epDeps = plan.toDependencies();
    const getKey = (ep: EPDependencies[string]) =>
        key === "detail" || !ep.elementId ? ep.detail : ep.elementId;
    const toKey = (d: EPDependency) => getKey(epDeps[d.id]);
    Object.keys(epDeps).map((id) => {
        const ep = epDeps[id];
        ret[getKey(ep)] = ep.deps.map(toKey).sort();
    });
    return ret;
}
