/*
 * Copyright 2018-2019 Unbounded Systems, LLC
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
    build,
    deepFilterElemsToPublic,
    DeployHelpers,
    GoalStatus,
    Group,
    handle,
    SFCDeclProps,
    useImperativeMethods,
    useState,
    waiting
} from "../../src";
import { Sequence } from "../../src/builtin_components/sequence";
import { createBasicTestPlugin, DeployOptions, MockDeploy } from "../testlib";

interface PrimProps {
    id: number;
    deployed: () => boolean;
    action?: () => MaybePromise<void>;
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
    }

    initialState() { return { acted: false }; }

    deployedWhen = (goalStatus: GoalStatus, helpers: DeployHelpers) => {
        // The reason we need this state is a little stupid. We want the deploy
        // execute() function to return after we deploy one (more) Prim
        // component, so we can check to see that ONLY one deployed. But
        // execute() doesn't exit unless there's a state change (so it can
        // do a rebuild).
        this.setState({ done: this.props.deployed() });

        return this.props.deployed() ? true : waiting("Not ready");
    }
}

interface ToPrimProps extends PrimProps {
    toPrimDeployed?: () => boolean;
}

function ToPrim(props: SFCDeclProps<ToPrimProps>) {
    const { handle: _h, toPrimDeployed, ...rest } = props;
    const [ , setDeployed ] = useState<boolean>(false);

    useImperativeMethods(() => {
        if (!toPrimDeployed) return {};
        const deployedWhen = () => {
            setDeployed(toPrimDeployed());
            return toPrimDeployed() ? true : waiting("ToPrim not ready");
        };
        return { deployedWhen };
    });

    return <Prim {...rest} />;
}

function ToNull() {
    return null;
}

describe("Sequence Component Tests", () => {
    let deploy: MockDeploy;
    let deployPass = 0;
    const deployedFn = (id: number) => () => {
        return id <= deployPass;
    };

    let actionsDone: number[] = [];
    const actionFn = (id: number) => () => { actionsDone.push(id); };

    const deployOpts: DeployOptions = {
        once: true,
    };

    mochaTmpdir.all("adapt-sequence-tests");

    beforeEach(async () => {
        deploy = new MockDeploy({
            pluginCreates: [ createBasicTestPlugin ],
            tmpDir: process.cwd(),
        });
        await deploy.init();
        actionsDone = [];
    });

    it("Should instantiate with no children", async () => {
        const root = <Sequence />;
        const { contents: dom } = await build(root, null);
        should(dom).equal(null);
    });

    it("Should instantiate with no primitive children", async () => {
        const root =
            <Sequence>
                <ToNull />
                <ToNull />
            </Sequence>;
        const { contents: dom } = await build(root, null);
        should(dom).equal(null);
    });

    it("Should instantiate children", async () => {
        const root = <Sequence key="foo">
            <Prim key="1" id={1} deployed={() => false} />
            <Prim key="2" id={2} deployed={() => false} />
        </Sequence>;
        const { contents: dom } = await build(root, null);
        if (dom === null) throw should(dom).not.equal(null);
        const ref = deepFilterElemsToPublic(
            <Group key="foo">
                <Prim key="1" id={1} deployed={() => false} />
                <Prim key="2" id={2} deployed={() => false} />
            </Group>
        );
        should(deepFilterElemsToPublic(dom)).eql(ref);
    });

    it("Should deploy primitive elements in sequence", async () => {
        const actionsExpected: number[] = [];

        for (deployPass = 0; deployPass <= 3; deployPass++) {
            const root =
                <Sequence>
                    <Prim key="1" id={1} deployed={deployedFn(1)} action={actionFn(1)} />
                    <Prim key="2" id={2} deployed={deployedFn(2)} action={actionFn(2)} />
                    <Prim key="3" id={3} deployed={deployedFn(3)} action={actionFn(3)} />
                </Sequence>;
            const { deployComplete } = await deploy.deploy(root, deployOpts);
            // Complete only on final pass
            should(deployComplete).equal(deployPass === 3);

            if (deployPass < 3) actionsExpected.push(deployPass + 1);
            should(actionsDone).eql(actionsExpected);
        }
    });

    it("Should deploy FC elements in sequence", async () => {
        const actionsExpected: number[] = [];

        for (deployPass = 0; deployPass <= 3; deployPass++) {
            const root =
                <Sequence>
                    <ToPrim key="1" id={1} deployed={deployedFn(1)} action={actionFn(1)} />
                    <ToPrim key="2" id={2} deployed={deployedFn(2)} action={actionFn(2)} />
                    <ToPrim key="3" id={3} deployed={deployedFn(3)} action={actionFn(3)} />
                </Sequence>;
            const { deployComplete } = await deploy.deploy(root, deployOpts);
            // Complete only on final pass
            should(deployComplete).equal(deployPass === 3);

            if (deployPass < 3) actionsExpected.push(deployPass + 1);
            should(actionsDone).eql(actionsExpected);
        }
    });

    it("Should deploy FC elements with deployedWhen in sequence", async () => {
        const actionsExpected: number[] = [];

        for (deployPass = 0; deployPass <= 3; deployPass++) {
            const root =
                <Sequence>
                    <ToPrim key="1" id={1} toPrimDeployed={deployedFn(1)} deployed={() => true} action={actionFn(1)} />
                    <ToPrim key="2" id={2} toPrimDeployed={deployedFn(2)} deployed={() => true} action={actionFn(2)} />
                    <ToPrim key="3" id={3} toPrimDeployed={deployedFn(3)} deployed={() => true} action={actionFn(3)} />
                </Sequence>;

            if (deployPass === 0) { // Only check deps once
                const { dom, dependencies, mountedOrig } = await deploy.getExecutionPlan(root, deployOpts);
                if (dom == null) throw should(dom).be.ok();
                if (mountedOrig == null) throw should(mountedOrig).be.ok();
                should(dependencies).eql({
                    '["Sequence","Sequence","1"]': [],
                    "Action create - 1": [],
                    '["Sequence","Sequence","1","1"]': [ "Action create - 1" ],

                    // Dependency should be on the mountedOrig (ToPrim) component
                    '["Sequence","Sequence","2"]': [ '["Sequence","Sequence","1"]' ],
                    "Action create - 2": [ '["Sequence","Sequence","1"]' ],
                    '["Sequence","Sequence","2","2"]': [ "Action create - 2" ],

                    // Dependency should be on the mountedOrig (ToPrim) component
                    '["Sequence","Sequence","3"]': [ '["Sequence","Sequence","2"]' ],
                    "Action create - 3": [ '["Sequence","Sequence","2"]' ],
                    '["Sequence","Sequence","3","3"]': [ "Action create - 3" ],

                    // These don't have dependencies, but they do have deployedWhens
                    '["Sequence"]': [],
                    '["Sequence","Sequence"]': [],
                    '["Sequence","Sequence","Sequence"]': [],
                });
            }

            const { deployComplete } = await deploy.deploy(root, deployOpts);
            // Complete only on final pass
            should(deployComplete).equal(deployPass === 3);

            if (deployPass < 3) actionsExpected.push(deployPass + 1);
            should(actionsDone).eql(actionsExpected);
        }
    });

    it("Should deploy handles in sequence", async () => {
        const actionsExpected: number[] = [];

        const addExpected = (id: number, whichPass: number) => {
            if (deployPass === whichPass) actionsExpected.push(id);
        };

        const maxPass = 6;
        for (deployPass = 0; deployPass <= maxPass; deployPass++) {
            const [ h1, h3, h5 ] = [ handle(), handle(), handle() ];
            const root =
                <Group>
                    <ToPrim key="5" id={5} handle={h5} deployed={deployedFn(5)} action={actionFn(5)} />
                    <ToPrim key="1" id={1} handle={h1} deployed={deployedFn(1)} action={actionFn(1)} />
                    <ToPrim key="3" id={3} handle={h3} deployed={deployedFn(3)} action={actionFn(3)} />

                    <Sequence>
                        {h1}
                        <Prim key="2" id={2} deployed={deployedFn(2)} action={actionFn(2)} />
                        {h3}
                        <ToPrim key="4" id={4} toPrimDeployed={deployedFn(4)}
                            deployed={() => true} action={actionFn(4)} />
                        {h5}
                        <Prim key="6" id={6} deployed={deployedFn(6)} action={actionFn(6)} />
                    </Sequence>
                </Group>;

            if (deployPass === 0) { // Only check deps once
                const { dom, dependencies, mountedOrig } = await deploy.getExecutionPlan(root, deployOpts);
                if (dom == null) throw should(dom).be.ok();
                if (mountedOrig == null) throw should(mountedOrig).be.ok();

                should(dependencies).eql({
                    "Action create - 1": [],
                    "Action create - 2": [ '["Group","1"]' ],
                    "Action create - 3": [],
                    "Action create - 4": [ '["Group","3"]' ],
                    "Action create - 5": [],
                    "Action create - 6": [ '["Group","5"]' ],

                    '["Group","1","1"]': [ "Action create - 1" ],
                    '["Group","3","3"]': [ "Action create - 3" ],
                    '["Group","5","5"]': [ "Action create - 5" ],

                    '["Group","Sequence","Sequence","2"]': [ "Action create - 2" ],

                    // ToPrim gets a dependency on 3
                    '["Group","Sequence","Sequence","4"]': [ '["Group","3"]' ],
                    '["Group","Sequence","Sequence","4","4"]': [ "Action create - 4" ],

                    '["Group","Sequence","Sequence","6"]': [ "Action create - 6" ],

                    // Intermediate components don't get dependencies
                    '["Group"]': [],
                    '["Group","1"]': [],
                    '["Group","3"]': [],
                    '["Group","5"]': [],
                    '["Group","Sequence"]': [],
                    '["Group","Sequence","Sequence"]': [],
                    '["Group","Sequence","Sequence","Sequence"]': [],
                });

            }

            const { deployComplete } = await deploy.deploy(root, deployOpts);
            // Complete only on final pass
            should(deployComplete).equal(deployPass === maxPass);

            // Elements outside of sequence have no dependencies, so will all
            // act immediately.
            addExpected(5, 0);
            addExpected(1, 0);
            addExpected(3, 0);

            addExpected(2, 1);
            addExpected(4, 3);
            addExpected(6, 5);

            should(actionsDone.length).equal(actionsExpected.length);
            should(actionsDone).containDeep(actionsExpected);
        }
    });

});
