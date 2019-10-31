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
    isMountedElement,
    SFCDeclProps,
} from "../jsx";
import { Children } from "../type_support";
import { Group } from "./group";

/**
 * Props for {@link Adapt.Sequence}.
 */
export interface SequenceProps extends Children<Handle | AdaptElement | null> { }

function toHandle(val: Handle | AdaptElement): Handle {
    return isElement(val) ? val.props.handle : val;
}

function handleDependsOn(h: Handle, dependency: Handle) {
    const orig = h.mountedOrig;
    if (!orig) return;
    orig.addDependency(dependency);
}

/**
 * Component that deploys its children sequentially.
 * @public
 */
export function Sequence(props: SFCDeclProps<SequenceProps>) {
    const origChildren = childrenToArray(props.children).filter(notNull);
    const newProps = {
        key: props.key,
        origChildren,
    };
    return createElement(SequenceDeferred, newProps, origChildren);
}

interface SequenceDeferredProps extends SequenceProps {
    origChildren: (Handle | AdaptElement)[];
}

function nextBuilt(el: AdaptElement, skip?: AdaptElement) {
    const next = el.props.handle.nextMounted((e) => e !== skip && isMountedElement(e) && e.built());
    return next === skip ? undefined : next;
}

class SequenceDeferred extends DeferredComponent<SequenceDeferredProps> {
    build() {
        const props = this.props;
        const origKids = props.origChildren;

        let prev: Handle | undefined;
        for (const k of origKids) {
            if (!isHandle(k) && !isElement(k)) {
                throw new Error("Children of a Sequence component must be an " +
                    "Element or Handle. Invalid child: " + util.inspect(k));
            }
            const kHandle = toHandle(k);

            // Only Elements inside the Sequence get dependencies. Handles
            // inside a sequence don't get any new dependencies.
            if (prev && isElement(k)) {
                for (let el = nextBuilt(k); el != null; el = nextBuilt(el, el)) {
                    handleDependsOn(el.props.handle, prev);
                }
            }
            prev = kHandle;
        }

        const finalKids = childrenToArray(props.children).filter(isElement);
        if (finalKids.length === 0) return null;

        return createElement(Group, { key: props.key }, finalKids);
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
