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
    AdaptElement,
    BuildData,
    BuildHelpers,
    BuiltinProps,
    DeferredComponent,
    gql,
    isElement,
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
    Metadata,
    ResourceBase,
    ResourcePod,
    ResourceProps
} from "./common";
import { K8sObserver } from "./k8s_observer";
import { deployIDToLabel, registerResourceKind, resourceIdToName } from "./manifest_support";
import { PodSpec } from "./Pod";
import { isResource, Resource } from "./Resource";

/**
 * LabelSelectorRequirement used in {@link k8s.LabelSelector}
 *
 * @public
 */
interface LabelSelectorRequirement {
    /**
     * key is the label key that the selector applies to.
     *
     * patch strategy: merge
     * patch merge key: key
     */
    key: string;

    /**
     * operator represents a key's relationship to a set of values.
     * Valid operators are In, NotIn, Exists and DoesNotExist.
     */
    operator: string;
    /**
     * values is an array of string values.
     * If the operator is In or NotIn, the values array must be non-empty.
     * If the operator is Exists or DoesNotExist, the values array must be empty.
     * This array is replaced during a strategic merge patch.
     */
    values: string[];
}

interface LabelSelector {
    /**
     * matchExpressions is a list of label selector requirements. The requirements are ANDed.
     */
    matchExpressions?: LabelSelectorRequirement[];
    /**
     * matchLabels is a map of {key,value} pairs. A single {key,value} in the matchLabels map
     * is equivalent to an element of matchExpressions, whose key field is "key", the operator
     * is "In", and the values array contains only "value". The requirements are ANDed.
     */
    matchLabels?: { [key: string]: string };
}

interface DaemonSetUpdateStrategyOnDelete {
    type: "OnDelete";
}

/** Rolling update configuration for {@link k8s.DaemonSetUpdateStrategy } */
interface DaemonSetUpdateStrategyRollingUpdate {
    type: "RollingUpdate";
    rollingUpdate: {
        /**
         * The maximum number of DaemonSet pods that can be unavailable during the update.
         * Value can be an absolute number (ex: 5) or a percentage of total number of
         * DaemonSet pods at the start of the update (ex: 10%).
         * Absolute number is calculated from percentage by rounding up. This cannot be 0.
         * Default value is 1.
         *
         * @example
         * when this is set to 30%, at most 30% of the total number of nodes that should
         * be running the daemon pod (i.e. status.desiredNumberScheduled) can have their
         * pods stopped for an update at any given time. The update starts by stopping at
         * most 30% of those DaemonSet pods and then brings up new DaemonSet pods in their
         * place. Once the new pods are available, it then proceeds onto other DaemonSet pods,
         * thus ensuring that at least 70% of original number of DaemonSet pods are available
         * at all times during the update.
         */
        maxUnavailable: number | string;
    };
}

/**
 * Update Strategy for {@link k8s.DaemonSet}
 *
 * @public
 */
type DaemonSetUpdateStrategy = DaemonSetUpdateStrategyRollingUpdate | DaemonSetUpdateStrategyOnDelete;

/**
 * PodTemplateSpec from k8s API
 *
 * @public
 */
interface PodTemplateSpec {
    /**
     * Standard object's metadata.
     * More Info: {@link https://git.k8s.io/community/contributors/devel/sig-architecture/api-conventions.md#metadata}
     */
    metadata: Metadata;
    // tslint:disable: max-line-length
    /**
     * Specification of the desired behavior of the pod.
     * More Info: {@link https://git.k8s.io/community/contributors/devel/sig-architecture/api-conventions.md#spec-and-status}
     */
    // tslint:enable: max-line-length
    spec: PodSpec;
}

/**
 * Spec for {@link k8s.DaemonSet} for use in {@link k8s.Resource}
 *
 * @public
 */
export type DaemonSetSpec = Exclude<DaemonSetProps, ResourceBase> & { template: PodTemplateSpec };

/**
 * Props for {@link k8s.DaemonSet}
 *
 * @public
 */
interface DaemonSetProps extends WithChildren {
    /** Information about the k8s cluster (ip address, auth info, etc.) */
    config: ClusterInfo;

    /** k8s metadata */
    metadata: Metadata;

    /**
     * The minimum number of seconds for which a newly created DaemonSet pod should
     * be ready without any of its container crashing, for it to be considered
     * available. Defaults to 0 (pod will be considered available as soon as it is ready).
     */
    minReadySeconds: number;
    /**
     * The number of old history to retain to allow rollback. This is a pointer to
     * distinguish between explicit zero and not specified. Defaults to 10.
     */
    revisionHistoryLimit: number;

    /**
     * A label query over pods that are managed by the daemon set.
     * Must match in order to be controlled. It must match the pod template's labels.
     * More Info: {@link https://kubernetes.io/docs/concepts/overview/working-with-objects/labels/#label-selectors}
     *
     * @remarks
     *
     * With Adapt, this is optional.  If not specified, adapt will pick a selector that will work with the pods
     * it creates as part of this {@link k8s.DaemonSet}
     */
    selector?: LabelSelector;

    /**
     * An update stratgey to replace existing DaemonSet pods with new pods
     */
    updateStrategy: DaemonSetUpdateStrategy;
}

function isResourcePod(x: any): x is AdaptElement<ResourcePod> {
    if (!isElement(x)) return false;
    if (!isResource(x)) return false;
    if (x.props.apiVersion !== "v1" && x.props.kind === "Pod") return true;
    return false;
}

function checkChildren(children: any) {
    if ((isArray(children) && children.length !== 1) || children == null) {
        throw new Error(`DaemonSet must only have a single Pod as a child, found ${children == null ? 0 : children.length}`);
    }

    const child = isArray(children) ? children[0] : children;
    if (!isResourcePod(child)) throw new Error(`DaemonSet child is not a Pod`);
    return child;
}

function makeDaemonSetManifest(props: SFCBuildProps<DaemonSetProps>, id: string, helpers: BuildHelpers) {
    const {
        metadata,
        minReadySeconds,
        revisionHistoryLimit,
        selector: userSelector,
        updateStrategy,
        children } = props;
    const child = checkChildren(children);

    const { deployID } = helpers;
    const labels = {
        adaptDaemonSet: resourceIdToName(props.key, id, deployID),
        adaptDeployID: deployIDToLabel(deployID),
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
            adaptDeployID: helpers.deployID,
        }
    };
    const podSpec = child.props.spec;
    const selector = userSelector ? userSelector : { matchLabels: labels };
    const spec = {
        minReadySeconds,
        revisionHistoryLimit,
        selector,
        updateStrategy,
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
 * Component for Kubernetes DaemonSet
 *
 * @public
 */
export class DaemonSet extends DeferredComponent<DaemonSetProps> {
    static defaultProps = {
        metadata: {},
        minReadySeconds: 0,
        revisionHistoryLimit: 10,
        updateStrategy: {
            type: "RollingUpdate",
            rollingUpdate: { maxUnavailable: 1 },
        }
    };

    constructor(props: DaemonSetProps) {
        checkChildren(props.children);
        super(props);
    }

    build(helpers: BuildHelpers) {
        const props = this.props as DaemonSetProps & Required<BuiltinProps>;
        const { key, config } = props;

        const manifest = makeDaemonSetManifest(props, mountedElement(props).id, helpers);
        return <Resource
            key={key}
            config={config}
            apiVersion="apps/v1"
            kind="DaemonSet"
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
    if (!status || !status.status) return waiting(`Kubernetes cluster returned invalid status for DaemonSet`);
    const {
        currentNumberScheduled,
        desiredNumberScheduled,
        numberAvailable,
        updatedNumberScheduled,
        numberReady,
    } = status.status;
    const ready = minBy([
        { val: numberAvailable, field: "available" },
        { val: numberReady, field: "ready" },
        { val: updatedNumberScheduled, field: "updated"},
        { val: currentNumberScheduled, field: "scheduled" }], (val) => val.val)!;

    if (ready.val >= desiredNumberScheduled) return true;

    // FIXME(manishv) we should really also query the status of all the pods related to
    // the DaemonSet and report if any have failed, but only if some are not ready.
    // For example, it would be bad to query the status of 10,000 pods on a 10k node
    // cluster for every status update.  But we'd want to query if there were a pod
    // failure and report the failure.  Not sure if there is a good way to do this though.
    return waiting(
          `Waiting for enough pods (${ready.val} (${ready.field})/${desiredNumberScheduled} (desired)\n`
        + `Desired: ${desiredNumberScheduled}, Updated: ${updatedNumberScheduled}, Available: ${numberAvailable}, Ready: ${numberReady}, Scheduled: ${currentNumberScheduled}`);
}

/** @internal */
export const daemonSetResourceInfo = {
    kind: "DaemonSet",
    deployedWhen,
    statusQuery: async (props: ResourceProps, observe: ObserveForStatus, buildData: BuildData) => {
        const obs: any = await observe(K8sObserver, gql`
            query ($name: String!, $kubeconfig: JSON!, $namespace: String!) {
                withKubeconfig(kubeconfig: $kubeconfig) {
                    readAppsV1NamespacedDaemonSet(name: $name, namespace: $namespace) @all(depth: 100)
                }
            }`,
            {
                name: resourceIdToName(props.key, buildData.id, buildData.deployID),
                kubeconfig: props.config.kubeconfig,
                namespace: computeNamespaceFromMetadata(props.metadata)
            }
        );
        return obs.withKubeconfig.readAppsV1NamespacedDaemonSet;
    },
};

registerResourceKind(daemonSetResourceInfo);
