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

import { messagesToString } from "@adpt/utils";
import should from "should";
import {
    AdaptElement,
    AdaptMountedElement,
    build,
    buildPrinter,
    FinalDomElement,
    StateStore,
} from "../../src";
import { isBuildOutputPartial, ProcessStateUpdates } from "../../src/dom";

export interface DoBuildOpts {
    deployID?: string;
    stateStore?: StateStore;
    debug?: boolean;
    style?: AdaptElement | null;
}
export interface DoBuildOptsNullOk extends DoBuildOpts {
    nullDomOk: true;
}

export interface DoBuild {
    builtElements: AdaptMountedElement[];
    mountedOrig: AdaptMountedElement;
    dom: FinalDomElement;
    processStateUpdates: ProcessStateUpdates;
}
export interface DoBuildNullOk {
    builtElements: AdaptMountedElement[];
    mountedOrig: AdaptMountedElement | null;
    dom: FinalDomElement | null;
    processStateUpdates: ProcessStateUpdates;
}

const doBuildDefaults = {
    deployID: "<none>",
    debug: false,
    style: null,
    nullDomOk: false,
};

export async function doBuild(elem: AdaptElement, options?: DoBuildOpts): Promise<DoBuild>;
export async function doBuild(elem: AdaptElement, options: DoBuildOptsNullOk): Promise<DoBuildNullOk>;
export async function doBuild(elem: AdaptElement, options: DoBuildOpts & Partial<DoBuildNullOk> = {}
    ): Promise<DoBuild | DoBuildNullOk>  {

    const { deployID, nullDomOk, stateStore, debug, style } = { ...doBuildDefaults, ...options };
    const buildOpts = {
        recorder: debug ? buildPrinter() : undefined,
        deployID,
        stateStore,
    };
    const buildOutput = await build(elem, style, buildOpts);

    const { messages } = buildOutput;
    if (messages.length > 0) {
        throw new Error(`DOM build failed. Messages:\n${messagesToString(messages)}`);
    }

    if (isBuildOutputPartial(buildOutput)) {
        should(buildOutput.buildErr).be.False();
        should(buildOutput.partialBuild).be.False();
        throw new Error("Partially built DOM, but no messages");
    }
    const { builtElements, mountedOrig, contents: dom, processStateUpdates } = buildOutput;
    if (!nullDomOk && dom == null) {
        should(dom).not.Null();
        should(dom).not.Undefined();
        throw new Error("Unreachable");
    }

    return { builtElements, dom, mountedOrig, processStateUpdates };
}
