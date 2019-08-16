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
import Adapt, {
    AdaptElement,
    build,
    Component,
    Constructor,
    createStateStore,
    deepFilterElemsToPublic,
    Group,
    isElement,
    PropsType,
    Sequence,
    StateStore,
    useReadyFrom,
    WithChildren,
} from "../../src";

import { Prim } from "../builtin_components/Sequence.spec";

export function withWrapper<W extends Constructor<Component<any, any>>>(
    // tslint:disable-next-line:variable-name
    Wrapped: W
) {
    return (props: PropsType<W> & WithChildren) => {
        const { children, handle, ...rest } = props as any;
        const wHand = Adapt.handle();
        useReadyFrom(wHand);
        return (
            <Wrapped handle={wHand} {...rest} >
                {children}
            </Wrapped>
        );
    };
}

describe("useReadyFrom", () => {

    async function buildAndCheck(
        root: AdaptElement,
        ref: AdaptElement | null,
        state?: StateStore): Promise<StateStore> {

        if (state === undefined) state = createStateStore();
        const { contents: dom } = await build(root, null, { stateStore: state });
        should(deepFilterElemsToPublic(dom)).eql(ref);
        return state;
    }

    it("Should use ready from wrapped component", async () => {
        // tslint:disable-next-line:variable-name
        const Wrapped = withWrapper(Prim);
        const ready = [false, false, false, false];
        const hand = Adapt.handle();
        const stages = [
            <Wrapped key="1" id={1} ready={() => ready[0]} />,
            <Wrapped key="2" id={2} ready={() => ready[1]} />,
            hand,
            <Wrapped key="3" id={3} ready={() => ready[3]} />
        ];
        const builtStages = [
            <Prim key="1" id={1} ready={() => ready[0]} />,
            <Prim key="2" id={2} ready={() => ready[1]} />,
            hand,
            <Prim key="3" id={3} ready={() => ready[3]} />
        ];
        const root = <Group key="outer">
            <Wrapped key="outside" id="out" ready={() => ready[2]} handle={hand} />
            <Sequence key="foo">
                {...stages}
            </Sequence>
        </Group>;

        // tslint:disable-next-line:prefer-for-of
        let state = createStateStore();
        for (let stage = 0; stage < stages.length; stage++) {
            const ref = deepFilterElemsToPublic(<Group key="outer">
                <Prim key="outside" id={"out"} ready={() => ready[2]} />
                <Group key="foo">
                    {...builtStages.slice(0, stage + 1).filter(isElement)}
                </Group>
            </Group>);
            state = await buildAndCheck(root, ref, state);
            state = await buildAndCheck(root, ref, state);
            ready[stage] = true;
        }
    });
});
