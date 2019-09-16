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
    AdaptMountedElement,
    BuildData,
    ChangeType,
    childrenToArray,
    DeployHelpers,
    DeployStatus,
    errorToNoStatus,
    FinalDomElement,
    GoalStatus,
    gqlGetOriginalErrors,
    isFinalDomElement,
    ObserveForStatus,
    waiting,
} from "@adpt/core";
import * as ld from "lodash";

import { InternalError } from "@adpt/utils";
import { Action, ActionContext, ShouldAct } from "../action";
import { ResourceProps } from "./common";
import { kubectlDiff, kubectlGet, kubectlOpManifest } from "./kubectl";
import {
    getResourceInfo,
    makeManifest,
    Manifest,
} from "./manifest_support";

/**
 * Type assertion to see if an element is both a {@link k8s.Resource | Resource}
 * and a {@link @adpt/core#FinalElement | FinalElement}
 *
 * @param e - element to test
 * @returns `true` if e is both a FinalElement and a {@link k8s.Resource | Resource}, `false` otherwise
 *
 * @public
 */
export function isResourceFinalElement(e: AdaptElement):
    e is FinalDomElement<ResourceProps & Adapt.BuiltinProps> {
    return isFinalDomElement(e) && e.componentType === Resource;
}

/**
 * Decides if an existing Resource is scheduled for deletion
 */
function isDeleting(info: Manifest | undefined): boolean {
    return (info !== undefined) && ("deletionTimestamp" in info.metadata);
}

/**
 * Primitive Component recognized by the k8s plugin to represent resources
 * @public
 */
export class Resource extends Action<ResourceProps> {
    deployID_: string;
    manifest_: Manifest;

    constructor(props: ResourceProps) {
        super(props);
    }

    validate() {
        const children = childrenToArray((this.props as any).children);

        if (!ld.isEmpty(children)) return "Resource elements cannot have children";

        //Do other validations of Specs here
    }

    async shouldAct(op: ChangeType, ctx: ActionContext): Promise<ShouldAct> {
        this.validate();
        const deployID = ctx.buildData.deployID;
        const manifest = this.manifest(deployID);
        const name = manifest.metadata.name;
        const kind = manifest.kind;
        const oldManifest = await kubectlGet({
            kubeconfig: this.props.config.kubeconfig,
            name,
            kind
        });

        switch (op) {
            case ChangeType.create:
            case ChangeType.modify:
            case ChangeType.replace:
                if (oldManifest === undefined || isDeleting(oldManifest)) {
                    return {
                        act: true,
                        detail: `Creating ${kind} ${name}`
                    };
                } else {
                    const { forbidden, diff } = await kubectlDiff({
                        kubeconfig: this.props.config.kubeconfig,
                        manifest
                    });
                    const opStr = (forbidden || (op === ChangeType.replace)) ? "Replacing" : "Updating";
                    if (((diff !== undefined) && (diff !== "")) || forbidden) {
                        return {
                            act: true,
                            detail: `${opStr} ${kind} ${name}`
                        };
                    }
                }
                return false;
            case ChangeType.delete:
                if (oldManifest && !isDeleting(oldManifest)) {
                    return {
                        act: true,
                        detail: `Deleting ${kind} ${name}`
                    };
                }
                return false;
            case ChangeType.none:
                return false;
        }
    }

    async action(op: ChangeType, ctx: ActionContext): Promise<void> {
        const deployID = ctx.buildData.deployID;
        const manifest = this.manifest(deployID);
        const name = manifest.metadata.name;
        const kind = manifest.kind;
        const info = await kubectlGet({
            kubeconfig: this.props.config.kubeconfig,
            name,
            kind
        });
        let deleted = false;

        if (isDeleting(info)) {
            //Wait for deleting to complete, else create/modify/apply will fail
            await kubectlOpManifest("delete", {
                kubeconfig: this.props.config.kubeconfig,
                manifest,
                wait: true
            });
            deleted = true;
        }

        if (op === ChangeType.modify) {
            const { forbidden } = await kubectlDiff({
                kubeconfig: this.props.config.kubeconfig,
                manifest
            });
            op = (op === ChangeType.modify) && forbidden ? ChangeType.replace : op;
        }
        switch (op) {
            case ChangeType.create:
            case ChangeType.modify:
                await kubectlOpManifest("apply", {
                    kubeconfig: this.props.config.kubeconfig,
                    manifest
                });
                return;
            case ChangeType.replace:
                if (!deleted) {
                    await kubectlOpManifest("delete", {
                        kubeconfig: this.props.config.kubeconfig,
                        manifest,
                        wait: true
                    });
                }
                await kubectlOpManifest("apply", {
                    kubeconfig: this.props.config.kubeconfig,
                    manifest
                });
                return;
            case ChangeType.delete:
                if (deleted) return;
                await kubectlOpManifest("delete", {
                    kubeconfig: this.props.config.kubeconfig,
                    manifest,
                    wait: false
                });
                return;
            case ChangeType.none:
                return;
        }
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

    private mountedElement(): AdaptMountedElement<ResourceProps> {
        const handle = this.props.handle;
        if (handle === undefined) throw new InternalError("element requested but props.handle undefined");
        const elem = handle.mountedOrig;
        if (elem == null) throw new InternalError(`element requested but handle.mountedOrig is ${elem}`);
        return elem as AdaptMountedElement<ResourceProps>;
    }

    private manifest(deployID: string): Manifest {
        if (this.manifest_ && (this.deployID_ === deployID)) return this.manifest_;
        const elem = this.mountedElement();
        this.manifest_ = makeManifest(elem, deployID);
        return this.manifest_;
    }
}
