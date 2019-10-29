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

import { notNull } from "@adpt/utils";
import * as util from "util";
import { DeployHelpers, GoalStatus, waiting } from "../deploy";
import { Handle, isHandle } from "../handle";
import {
    AdaptElement,
    childrenToArray,
    createElement,
    DeferredComponent,
    isElement,
} from "../jsx";
import { Children } from "../type_support";
import { Group } from "./group";

export interface SequenceProps extends Children<Handle | AdaptElement | null> { }

function toHandle(val: Handle | AdaptElement): Handle {
    return isElement(val) ? val.props.handle : val;
}

function handleDependsOn(h: Handle, dependency: Handle) {
    const orig = h.mountedOrig;
    if (!orig) return;
    orig.addDependency(dependency);
}

export class Sequence extends DeferredComponent<SequenceProps> {
    build() {
        const props = this.props;
        const kids = childrenToArray(props.children).filter(notNull);
        if (kids.length === 0) return null;

        let prev: Handle | undefined;
        for (const k of kids) {
            if (!isHandle(k) && !isElement(k)) {
                throw new Error("Children of a Sequence component must be an " +
                    "Element or Handle. Invalid child: " + util.inspect(k));
            }
            const kHandle = toHandle(k);

            // Only Elements inside the Sequence get dependencies. Handles
            // inside a sequence don't get any new dependencies.
            if (prev && isElement(k)) handleDependsOn(kHandle, prev);
            prev = kHandle;
        }

        return createElement(Group, { key: props.key }, kids.filter(isElement));
    }

    deployedWhen = (_goalStatus: GoalStatus, helpers: DeployHelpers) => {
        const unready = childrenToArray(this.props.children)
            .map((k) => isElement(k) ? k.props.handle : isHandle(k) ? k : null)
            .filter(notNull)
            .filter((h) => !helpers.isDeployed(h));
        return unready.length === 0 ? true :
            waiting(`Waiting on ${unready.length} child elements`, unready);
    }
}
