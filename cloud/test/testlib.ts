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

import { Action, AdaptElement, ChangeType } from "@adpt/core";
import { toArray } from "@adpt/utils";
import * as randomstring from "randomstring";
import should from "should";
import * as util from "util";

// tslint:disable-next-line:no-submodule-imports
export { doBuild, MockDeploy, makeDeployId } from "@adpt/core/dist/test/testlib";

export const smallDockerImage = "alpine:3.8";

export async function act(actions: Action[]) {
    for (const action of actions) {
        try {
            await action.act();
        } catch (e) {
            throw new Error(`${action.detail} Action failed: ${util.inspect(e)}`);
        }
    }
}

export function randomName(base: string) {
    const rand = randomstring.generate({
        length: 10,
        charset: "alphabetic",
        readable: true,
        capitalization: "lowercase",
    });
    return `${base}-${rand}`;
}

export type NoChangeList = AdaptElement | AdaptElement[] | AdaptElement[][];

// If els is:
// 1) A single Element - then check for one Action with one Change
// 2) An array of Elements - then check for one Action per Element and one
//    change per Action.
// 3) An array of arrays - then check for one Action per top level array
//    which contains a Change for each Element in the sub-array.
export function checkNoChanges(actions: Action[], els: NoChangeList) {
    const actionEls = toArray(els);
    should(actions).have.length(actionEls.length);
    actions.forEach((a, i) => {
        const changedEls = toArray(actionEls[i]);
        const elSet = new Set(changedEls);
        should(a.type).equal(ChangeType.none);
        should(a.detail).equal("No changes required");
        should(a.changes).have.length(elSet.size);
        a.changes.forEach((c) => {
            should(c.type).equal(ChangeType.none);
            should(c.detail).equal("No changes required");
            const had = elSet.delete(c.element);
            should(had).be.True();
        });
    });
}
