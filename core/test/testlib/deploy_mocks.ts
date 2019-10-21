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
import { createTaskObserver, messagesToString } from "@adpt/utils";
import fs from "fs-extra";
import * as path from "path";
import randomstring from "randomstring";
import { ActComplete, PluginModule } from "../../src/deploy";
import { createPluginManager } from "../../src/deploy/plugin_support";
import { noStateUpdates, ProcessStateUpdates } from "../../src/dom";
import { AdaptElement, AdaptMountedElement, FinalDomElement } from "../../src/jsx";
import { Deployment } from "../../src/server/deployment";
import { DeployOpID, DeployStepID } from "../../src/server/deployment_data";
import { createStateStore, StateStore } from "../../src/state";
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
    style?: AdaptElement | null;
}

const defaultDeployOptions = {
    dryRun: false,
    once: false,
    debug: false,
    logError: true,
    style: null,
};

export interface DeployOutput extends ActComplete {
    dom: FinalDomElement | null;
    mountedOrig: AdaptMountedElement | null;
    stepID: DeployStepID;
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

    async deploy(orig: AdaptElement | null, options: DeployOptions = {}): Promise<DeployOutput> {
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
                processStateUpdates,
                taskObserver,
            };

            const mgr = createPluginManager(this.plugins);

            try {
                await mgr.start(this.prevDom, dom, mgrOpts);
                await mgr.observe();
                mgr.analyze();
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
