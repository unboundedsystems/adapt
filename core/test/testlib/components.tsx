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

import should from "should";
import Adapt from "../../src";
import * as jsx from "../../src/jsx";
import { makeObserverManagerDeployment } from "../../src/observers";

export function checkChildComponents(element: Adapt.AdaptElement, ...children: any[]) {
    const childArray = jsx.childrenToArray(element.props.children);

    const childComponents = childArray.map(
        (child: any) => {
            if (Adapt.isElement(child)) {
                return child.componentType;
            } else {
                return undefined;
            }
        }
    );

    should(childComponents).eql(children);
}

export class Empty extends Adapt.PrimitiveComponent<{ id: number }> { }

export function MakeMakeEmpty(props: { id: number }) {
    return <MakeEmpty id={props.id} />;
}

export function MakeEmpty(props: { id: number }) {
    return <Empty id={props.id} />;
}

export function MakeGroup(props: { children?: Adapt.AdaptElement[] | Adapt.AdaptElement }) {
    return <Adapt.Group>{props.children}</Adapt.Group>;
}

export interface WithDefaultsProps {
    prop1: number;
    prop2: number;
}
export class WithDefaults extends Adapt.Component<WithDefaultsProps> {
    static defaultProps = {
        prop1: 100,
        prop2: 200,
    };

    build() {
        return (
            <Adapt.Group>
                <Empty key="1" id={this.props.prop1!} />
                <Empty key="2" id={this.props.prop2!} />
            </Adapt.Group>
        );
    }
}

// Constructor data that doesn't actually keep track of state
const noStoreConstructorData: jsx.ComponentConstructorData = {
    deployInfo: {
        deployID: "mockdeploy",
        deployOpID: 0,
    },
    getState: () => ({}),
    setInitialState: () => {/**/ },
    stateUpdates: [],
    observerManager: makeObserverManagerDeployment({}) //Just a placeholder value, observers may not yet be registered
};

export function componentConstructorDataFixture(ccData = noStoreConstructorData) {
    ccData.observerManager =
        makeObserverManagerDeployment({}); //Make sure we call after registerObserver from modules are done
    before(() => jsx.pushComponentConstructorData(ccData));
    after(() => jsx.popComponentConstructorData());
}

export class Info extends Adapt.PrimitiveComponent<Adapt.AnyProps> { }

export interface MethodValueProps {
    target: Adapt.Handle;
    method: string;
    args?: any[];
    default?: any;
}

export function MethodValue(props: MethodValueProps) {
    const def = "default" in props ? props.default : "DEFAULT";
    const args = props.args || [];
    const val = Adapt.useMethod(props.target, def, props.method, ...args);
    return <Info value={val} />;
}
