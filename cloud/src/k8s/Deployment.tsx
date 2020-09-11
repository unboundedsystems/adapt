/*
 * Copyright 2020 Unbounded Systems, LLC
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
    BuildData,
    BuildHelpers,
    BuiltinProps,
    DeferredComponent,
    gql,
    ObserveForStatus,
    SFCBuildProps,
    waiting,
    WithChildren} from "@adpt/core";
import { minBy } from "lodash";
import { isArray } from "util";
import { mountedElement } from "../common";
import {
    ClusterInfo,
    computeNamespaceFromMetadata,
    LabelSelector,
    Metadata,
    PodTemplateSpec,
    ResourceBase,
    ResourcePropsWithConfig
} from "./common";
import { K8sObserver } from "./k8s_observer";
import { deployIDToLabel, labelKey, registerResourceKind, resourceIdToName } from "./manifest_support";
import { Resource } from "./Resource";
import { isResourcePodTemplate } from "./utils";

/** @public */
export interface DeploymentUpdateStrategyRecreate {
    type: "Recreate";
}

/** @public */
export interface RollingUpdateDeployment {
    /**
     * The maximum number of pods that can be scheduled above the desired number of pods.
     *
     * Value can be an absolute number (ex: 5) or a percentage of desired pods (ex: 10%).
     * This can not be 0 if MaxUnavailable is 0.
     * Absolute number is calculated from percentage by rounding up.
     * Defaults to 25%.
     *
     * @example
     * When this is set to 30%, the new ReplicaSet can be scaled up immediately when the rolling update starts,
     * such that the total number of old and new pods do not exceed 130% of desired pods. Once old pods have been
     * killed, new ReplicaSet can be scaled up further, ensuring that total number of pods running at any time
     * during the update is at most 130% of desired pods.
     */
    maxSurge?: number | string;
    /**
     * The maximum number of pods that can be unavailable during the update.
     *
     * Value can be an absolute number (ex: 5) or a percentage of desired pods (ex: 10%).
     * Absolute number is calculated from percentage by rounding down.
     * This can not be 0 if MaxSurge is 0. Defaults to 25%.
     *
     * @example
     * When this is set to 30%, the old ReplicaSet can be scaled down to 70% of desired pods
     * immediately when the rolling update starts. Once new pods are ready, old ReplicaSet
     * can be scaled down further, followed by scaling up the new ReplicaSet, ensuring that
     * the total number of pods available at all times during the update is at least 70% of
     * desired pods.
     */
    maxUnavailable?: number | string;
}

/** Rolling update configuration for {@link k8s.DeploymentUpdateStrategy } */
interface DeploymentUpdateStrategyRollingUpdate {
    type: "RollingUpdate";
    rollingUpdate?: RollingUpdateDeployment;
}

/**
 * Update Strategy for {@link k8s.Deployment}
 *
 * @public
 */
type DeploymentUpdateStrategy = DeploymentUpdateStrategyRollingUpdate | DeploymentUpdateStrategyRecreate;

/**
 * Spec for {@link k8s.Deployment} for use in {@link k8s.Resource}
 *
 * @public
 */
export type DeploymentSpec = Exclude<DeploymentProps, ResourceBase> & { template: PodTemplateSpec };

/**
 * Props for {@link k8s.Deployment}
 *
 * @public
 */
interface DeploymentProps extends WithChildren {
    /** Information about the k8s cluster (ip address, auth info, etc.) */
    config: ClusterInfo;

    /** k8s metadata */
    metadata: Metadata;

    /**
     * The minimum number of seconds for which a newly created pod should
     * be ready without any of its container crashing, for it to be considered
     * available. Defaults to 0 (pod will be considered available as soon as it is ready).
     */
    minReadySeconds: number;

    /** Indicates that the deployment is paused */
    paused: boolean;

    /**
     * The maximum time in seconds for a deployment to make progress before it is considered to be failed.
     *
     * The deployment controller will continue to process failed deployments and a condition with a
     * ProgressDeadlineExceeded reason will be surfaced in the deployment status. Note that progress
     * will not be estimated during the time a deployment is paused. Defaults to 600s.
     */
    progressDeadlineSeconds: number;

    /**
     * Number of desired pods.
     *
     * Defaults to 1. 0 is not allowed.
     *
     * @defaultValue 1
     */
    replicas: number;

    /**
     * The number of old ReplicaSets to retain to allow rollback.
     *
     * This is a pointer to distinguish between explicit zero and not specified. Defaults to 10.
     *
     * @defaultValue 10
     */
    revisionHistoryLimit: number;

    /**
     * Label selector for pods.
     *
     * Existing ReplicaSets whose pods are selected by this will be the ones affected by this deployment.
     * It must match the pod template's labels.
     *
     * @remarks
     *
     * With Adapt, this is optional.  If not specified, adapt will pick a selector that will work with the pods
     * it creates as part of this {@link k8s.Deployment}
     */
    selector?: LabelSelector;

    /**
     * An deployment strategy to use to replace existing pods with new ones
     */
    strategy: DeploymentUpdateStrategy;
}

function checkChildren(children: any) {
    if ((isArray(children) && children.length !== 1) || children == null) {
        throw new Error(`Deployment must only have a single Pod as a child, found ${children == null ? 0 : children.length}`);
    }

    const child = isArray(children) ? children[0] : children;
    if (!isResourcePodTemplate(child)) throw new Error(`Deployment child is not a Pod Template`);
    return child;
}

function makeDeploymentManifest(props: SFCBuildProps<DeploymentProps>, id: string, helpers: BuildHelpers) {
    const {
        metadata,
        minReadySeconds,
        paused,
        progressDeadlineSeconds,
        replicas,
        revisionHistoryLimit,
        selector: userSelector,
        strategy,
        children } = props;
    const child = checkChildren(children);

    const { deployID } = helpers;
    const labels = {
        [labelKey("deployment")]: resourceIdToName(props.key, id, deployID),
        [labelKey("deployID")]: deployIDToLabel(deployID),
    };
    const podMetadataOrig = child.props.metadata || {};
    const podMetadata = {
        ...podMetadataOrig,
        labels: {
            ...podMetadataOrig.labels,
            ...labels,
        },
        annotations: {
            ...podMetadataOrig.annotations || {},
            [labelKey("deployID")]: helpers.deployID,
        }
    };
    const podSpec = child.props.spec;
    const selector = userSelector ? userSelector : { matchLabels: labels };
    const spec = {
        minReadySeconds,
        paused,
        progressDeadlineSeconds,
        replicas,
        revisionHistoryLimit,
        selector,
        strategy,
        template: {
            metadata: podMetadata,
            spec: podSpec
        }
    };
    return {
        metadata,
        spec
    };
}

/**
 * Component for Kubernetes Deployment
 *
 * @public
 */
export class Deployment extends DeferredComponent<DeploymentProps> {
    static defaultProps = {
        metadata: {},
        paused: false,
        replicas: 1,
        progressDeadlineSeconds: 600,
        minReadySeconds: 0,
        revisionHistoryLimit: 10,
        strategy: {
            type: "RollingUpdate",
            rollingUpdate: { maxSurge: "25%", maxUnavailable: "25%" },
        }
    };

    constructor(props: DeploymentProps) {
        checkChildren(props.children);
        super(props);
    }

    build(helpers: BuildHelpers) {
        const props = this.props as DeploymentProps & Required<BuiltinProps>;
        const { key, config } = props;

        const manifest = makeDeploymentManifest(props, mountedElement(props).id, helpers);
        return <Resource
            key={key}
            config={config}
            apiVersion="apps/v1"
            kind="Deployment"
            metadata={manifest.metadata}
            spec={manifest.spec}
        />;
    }

    async status(_observe: ObserveForStatus, buildData: BuildData) {
        const succ = buildData.successor;
        if (!succ) return undefined;
        return succ.status();
    }
}

function deployedWhen(statusObj: unknown) {
    const status: any = statusObj;
    if (!status || !status.status) return waiting(`Kubernetes cluster returned invalid status for Deployment`);
    const {
        availableReplicas,
        readyReplicas,
        replicas,
        updatedReplicas,
        conditions,
    } = status.status;
    const replicasDesired = status.spec.replicas;
    const ready = minBy([
        { val: availableReplicas, field: "available" },
        { val: readyReplicas, field: "ready" },
        { val: updatedReplicas, field: "updated"},
        { val: replicas, field: "current" }], (val) => val.val == null ? 0 : val.val)!;
    if (ready.val >= replicasDesired) return true;

    const conditionText = conditions && isArray(conditions)
        ? "\n" + conditions.map((c) => c.message).filter((c) => c.status !== "True").join("\n")
        : "";
    return waiting(
          `Waiting for enough pods (${ready.val} (${ready.field})/${replicasDesired} (desired)`
        +  conditionText);
}

/** @internal */
export const deploymentResourceInfo = {
    kind: "Deployment",
    deployedWhen,
    statusQuery: async (props: ResourcePropsWithConfig, observe: ObserveForStatus, buildData: BuildData) => {
        const obs: any = await observe(K8sObserver, gql`
            query ($name: String!, $kubeconfig: JSON!, $namespace: String!) {
                withKubeconfig(kubeconfig: $kubeconfig) {
                    readAppsV1NamespacedDeployment(name: $name, namespace: $namespace) @all(depth: 100)
                }
            }`,
            {
                name: resourceIdToName(props.key, buildData.id, buildData.deployID),
                kubeconfig: props.config.kubeconfig,
                namespace: computeNamespaceFromMetadata(props.metadata)
            }
        );
        return obs.withKubeconfig.readAppsV1NamespacedDeployment;
    },
};

registerResourceKind(deploymentResourceInfo);
