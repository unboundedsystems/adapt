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

import Adapt, {
    AdaptElement,
    BuildData,
    childrenToArray,
    DeployHelpers,
    DeployStatus,
    errorToNoStatus,
    FinalDomElement,
    GoalStatus,
    gqlGetOriginalErrors,
    isFinalDomElement,
    ObserveForStatus,
    PrimitiveComponent,
    waiting,
} from "@adpt/core";
import * as ld from "lodash";

import { ResourceProps } from "./common";
import { getResourceInfo } from "./k8s_plugin";

export function isResourceFinalElement(e: AdaptElement):
    e is FinalDomElement<ResourceProps & Adapt.BuiltinProps> {
    return isFinalDomElement(e) && e.componentType === Resource;
}

export class Resource extends PrimitiveComponent<ResourceProps> {
    constructor(props: ResourceProps) {
        super(props);
    }

    validate() {
        const children = childrenToArray((this.props as any).children);

        if (!ld.isEmpty(children)) return "Resource elements cannot have children";

        //Do other validations of Specs here
    }

    deployedWhen = async (goalStatus: GoalStatus, helpers: DeployHelpers) => {
        const kind = this.props.kind;
        const info = getResourceInfo(kind);
        const hand = this.props.handle;
        if (!info) throw new Error(`Invalid Resource kind ${kind}`);
        if (!hand) throw new Error("Invalid handle");
        try {
            const statObj = await helpers.elementStatus<any>(hand);
            if (goalStatus === DeployStatus.Destroyed) {
                return waiting(`Waiting for ${kind} to be destroyed`);
            }
            return info.deployedWhen(statObj, DeployStatus.Deployed);
        } catch (err) {
            if (ld.isError(err) && err.name === "K8sNotFound") {
                if (goalStatus === DeployStatus.Destroyed) return true;
                return waiting(`${kind} not present`);
            }
            throw err;
        }
    }

    async status(observe: ObserveForStatus, buildData: BuildData) {
        const info = getResourceInfo(this.props.kind);
        const statusQuery = info && info.statusQuery;
        if (!statusQuery) return { noStatus: "no status query defined for this kind" };
        try {
            return await statusQuery(this.props, observe, buildData);
        } catch (err) {
            // If there's only one GQL error and it's K8sNotFound, throw
            // that on up the stack. Otherwise, return a Status object.
            const orig = gqlGetOriginalErrors(err);
            if (orig && orig.length === 1 && orig[0].name === "K8sNotFound") {
                throw orig[0];
            }
            return errorToNoStatus(err);
        }
    }
}
