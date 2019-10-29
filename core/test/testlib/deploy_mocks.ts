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

import { createMockLogger } from "@adpt/testutils";
import { createTaskObserver, InternalError, messagesToString } from "@adpt/utils";
import fs from "fs-extra";
import { isFunction } from "lodash";
import * as path from "path";
import randomstring from "randomstring";
import { ActComplete, Action, ChangeType, ExecutionPlan, Plugin, PluginModule } from "../../src/deploy";
import { isExecutionPlanImpl } from "../../src/deploy/execution_plan";
import { createPluginManager, isPluginManagerImpl } from "../../src/deploy/plugin_support";
import { noStateUpdates, ProcessStateUpdates } from "../../src/dom";
import { domDiff } from "../../src/dom_utils";
import { AdaptElement, AdaptMountedElement, FinalDomElement } from "../../src/jsx";
import { Deployment } from "../../src/server/deployment";
import { DeployOpID, DeployStepID } from "../../src/server/deployment_data";
import { createStateStore, StateStore } from "../../src/state";
import { dependencies, StringDependencies } from "../deploy/common";
import { doBuild } from "./do_build";
import { createMockDeployment } from "./server_mocks";

export interface MockDeployOptions {
    deployOpID?: DeployOpID;
    pluginCreates: PluginModule["create"][];
    prevDom?: FinalDomElement;
    tmpDir: string;
    uniqueDeployID?: boolean;
}

export interface DeployOptions {
    dryRun?: boolean;
    once?: boolean;
    debug?: boolean;
    logError?: boolean;
    pollDelayMs?: number;
    style?: AdaptElement | null;
}

export interface GetExecutionPlanOptions {
    style?: AdaptElement | null;
}

interface DeployOptionsInternal extends DeployOptions {
    returnPlan?: boolean;
}

const defaultDeployOptions = {
    dryRun: false,
    once: false,
    debug: false,
    logError: true,
    pollDelayMs: 1000,
    style: null,
};

export interface DeployOutput extends ActComplete {
    dom: FinalDomElement | null;
    mountedOrig: AdaptMountedElement | null;
    stepID: DeployStepID;
}

export interface ExecutionPlanOutput {
    dependencies: StringDependencies;
    dom: FinalDomElement | null;
    mountedOrig: AdaptMountedElement | null;
    plan: ExecutionPlan;
}

export function makeDeployId(prefix: string) {
    const rand = randomstring.generate({
        length: 4,
        charset: "alphabetic",
        readable: true,
        capitalization: "lowercase",
    });
    return `${prefix}-${rand}`;
}

export class MockDeploy {
    prevDom: FinalDomElement | null = null;
    currDom: FinalDomElement | null = null;
    logger = createMockLogger();
    dataDir: string;
    deployID = "MockDeploy123";
    deployment_?: Deployment;
    deployOpID_?: DeployOpID;
    plugins = new Map<string, PluginModule>();
    // NOTE: Adding type "StateStore" here may seem redundant, but if it's
    // not explicit, the generated .d.ts file contains an import of @adpt/core
    // that causes builds in the cloud directory to try to add all of
    // adapt's SOURCE FILES to the cloud build...which creates huge compile
    // errors in cloud.
    stateStore: StateStore = createStateStore("{}");

    constructor(options: MockDeployOptions) {
        if (options.pluginCreates.length === 0) throw new Error(`Must specify plugins`);
        options.pluginCreates.forEach((create) => {
            const inst = create();
            const name = inst.constructor.name;
            this.plugins.set(name, {
                name,
                module,
                create,
                packageName: name,
                version: "0.0.1",
            });
        });
        if (options.prevDom) this.prevDom = options.prevDom;
        if (options.deployOpID != null) this.deployOpID_ = options.deployOpID;
        if (options.uniqueDeployID) this.deployID = makeDeployId("MockDeploy");
        this.dataDir = path.join(options.tmpDir, "pluginData");
    }

    async init() {
        this.deployment_ = await createMockDeployment({ deployID: this.deployID });
        await fs.ensureDir(this.dataDir);
        if (this.deployOpID_ == null) this.deployOpID_ = await this.deployment.newOpID();
    }

    get deployment() {
        if (!this.deployment_) throw new Error(`deployment == null. init not called?`);
        return this.deployment_;
    }

    get deployOpID() {
        if (this.deployOpID_ == null) throw new Error(`deployOpID == null. init not called?`);
        return this.deployOpID_;
    }
    set deployOpID(id: DeployOpID) {
        this.deployOpID_ = id;
    }

    async deploy(orig: AdaptElement | null,
        options: DeployOptions = {}): Promise<DeployOutput> {
        return this._deploy(orig, { returnPlan: false, ...options });
    }

    async getExecutionPlan(orig: AdaptElement | null,
        options: GetExecutionPlanOptions = {}): Promise<ExecutionPlanOutput> {
        return this._deploy(orig, { returnPlan: true, ...options });
    }

    private async _deploy(orig: AdaptElement | null,
        options: DeployOptionsInternal & { returnPlan: true }): Promise<ExecutionPlanOutput>;
    private async _deploy(orig: AdaptElement | null,
        options: DeployOptionsInternal & { returnPlan: false }): Promise<DeployOutput>;
    private async _deploy(orig: AdaptElement | null,
        options: DeployOptionsInternal): Promise<DeployOutput | ExecutionPlanOutput> {

        const { debug, style, ...opts } = { ...defaultDeployOptions, ...options };
        let dom: FinalDomElement | null;
        let mountedOrig: AdaptMountedElement | null;
        let processStateUpdates: ProcessStateUpdates;
        let builtElements: AdaptMountedElement[];

        while (true) {
            const taskObserver = createTaskObserver("parent", { logger: this.logger });
            taskObserver.started();

            processStateUpdates = noStateUpdates;
            builtElements = [];

            if (orig === null) {
                dom = null;
                mountedOrig = null;
            } else {
                const res = await doBuild(orig, {
                    debug,
                    deployID: this.deployID,
                    stateStore: this.stateStore,
                    style,
                });
                dom = res.dom;
                mountedOrig = res.mountedOrig;
                processStateUpdates = res.processStateUpdates;
                builtElements = res.builtElements;
            }
            this.prevDom = this.currDom;
            this.currDom = dom;

            const mgrOpts = {
                logger: this.logger,
                deployment: this.deployment,
                dataDir: this.dataDir,
            };
            const actOpts = {
                builtElements,
                deployOpID: this.deployOpID,
                dryRun: opts.dryRun,
                pollDelayMs: opts.pollDelayMs,
                processStateUpdates,
                taskObserver,
            };

            const mgr = createPluginManager(this.plugins);

            try {
                await mgr.start(this.prevDom, dom, mgrOpts);
                await mgr.observe();
                mgr.analyze();

                if (opts.returnPlan) {
                    if (!isPluginManagerImpl(mgr)) throw new InternalError(`Not a PluginManagerImpl`);
                    const plan = await mgr._createExecutionPlan(actOpts);
                    if (!isExecutionPlanImpl(plan)) throw new InternalError(`Not an ExecutionPlanImpl`);
                    return {
                        dependencies: dependencies(plan, { key: "id" }),
                        dom,
                        mountedOrig,
                        plan,
                    };
                }

                const actResults = await mgr.act(actOpts);
                await mgr.finish();

                if (opts.once || (actResults.deployComplete && !actResults.stateChanged)) {
                    const stepID = await this.deployment.currentStepID(this.deployOpID);
                    return { ...actResults, dom, mountedOrig, stepID };
                }
            } catch (err) {
                if (opts.logError) {
                    // tslint:disable-next-line: no-console
                    console.log(`Deploy error:`, err.message,
                        `\nDumping log messages:\n`,
                        messagesToString(this.logger.messages));
                }
                throw err;
            }
        }
    }
}

/**
 * A plugin that claims ALL primitive DOM elements. For any element
 * that has an `action` prop that's a function, that function will
 * get executed during the element's Action. Otherwise, the Action will
 * be a no-op.
 */
export class BasicTestPlugin implements Plugin<{}> {
    async start() {/* */}
    async observe() { return {}; }
    analyze(oldDom: FinalDomElement | null, newDom: FinalDomElement | null, _obs: {}): Action[] {
        const diff = domDiff(oldDom, newDom);
        const actions = (elems: FinalDomElement[], ct: ChangeType) => {
            return elems
                .map((el) => {
                    const act = async () => isFunction(el.instance.action) && el.instance.action();
                    const type = el.instance.action ? ct : ChangeType.none;
                    const detail = `Action ${type} - ${el.props.key}`;
                    return {
                        act,
                        type,
                        detail,
                        changes: [{
                            type,
                            element: el,
                            detail,
                        }]
                    };
                });
        };

        return actions([...diff.added], ChangeType.create)
            .concat(actions([...diff.commonNew], ChangeType.modify))
            .concat(actions([...diff.deleted], ChangeType.delete));
    }
    async finish() {/* */}
}

export function createBasicTestPlugin() {
    return new BasicTestPlugin();
}
