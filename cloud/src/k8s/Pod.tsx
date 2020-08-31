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
    BuildNotImplemented,
    childrenToArray,
    DeferredComponent,
    gql,
    isElement,
    ObserveForStatus,
    waiting
} from "@adpt/core";
import { InternalError, removeUndef } from "@adpt/utils";
import ld from "lodash";
import { ClusterInfo, computeNamespaceFromMetadata, ResourceProps } from "./common";
import { ContainerSpec, isK8sContainerElement, K8sContainer, K8sContainerProps } from "./Container";
import { K8sObserver } from "./k8s_observer";
import { registerResourceKind, resourceIdToName } from "./manifest_support";
import { Resource } from "./Resource";

/** @public */
export interface PodProps {
    config: ClusterInfo;
    terminationGracePeriodSeconds?: number;
    children: AdaptElement | AdaptElement[];
}

function isContainerArray(children: any[]): children is AdaptElement<K8sContainerProps>[] {
    const badKids = children.filter((c) => !isElement(c) || !isK8sContainerElement(c));
    if (badKids.length === 0) return true;
    const names = badKids.map((c) => isElement(c) ? c.componentName : String(c));
    throw new BuildNotImplemented(`Pod children must be of type ` +
        `${K8sContainer.name}. Invalid children are: ${names.join(", ")}`);
}

function dups<T>(data: T[]): T[] {
    const grouped = ld.groupBy(data, ld.identity);
    const filtered = ld.filter(grouped, (val) => val.length > 1);
    return ld.uniq(ld.flatten(filtered));
}

function defaultize(spec: ContainerSpec): ContainerSpec {
    spec = { ...spec };
    if (spec.env && spec.env.length === 0) delete spec.env;
    if (spec.tty !== true) delete spec.tty;
    if (spec.ports && spec.ports.length === 0) delete spec.ports;
    if (spec.ports) {
        spec.ports = spec.ports.map(
            (p) => p.protocol ? p : { ...p, protocol: "TCP" });
    }
    return spec;
}

function makePodManifest(props: PodProps) {
    const containers = ld.compact(
        childrenToArray(props.children)
            .map((c) => isK8sContainerElement(c) ? c : null));

    const spec: PodSpec = {
        containers: containers.map((c) => ({
            args: c.props.args,
            command: c.props.command, //FIXME(manishv)  What if we just have args and no command?
            env: c.props.env,
            image: c.props.image,
            imagePullPolicy: c.props.imagePullPolicy,
            name: c.props.name,
            ports: c.props.ports,
            tty: c.props.tty,
            workingDir: c.props.workingDir,
        }))
            .map(defaultize)
            .map(removeUndef),
        terminationGracePeriodSeconds: props.terminationGracePeriodSeconds
    };

    return {
        kind: "Pod",
        metadata: {},
        spec,
    };
}

/**
 * Component for Kubernetes Pods
 *
 * @public
 */
export class Pod extends DeferredComponent<PodProps> {
    static defaultProps = {
        terminationGracePeriodSeconds: 30,
    };

    build() {
        const { key } = this.props;
        if (!key) throw new InternalError("key is null");
        const children = childrenToArray(this.props.children);

        if (ld.isEmpty(children)) return null;
        if (!isContainerArray(children)) return null;

        const containerNames = children.map((child) => child.props.name);
        const dupNames = dups(containerNames);
        if (!ld.isEmpty(dupNames)) {
            throw new BuildNotImplemented(`Duplicate names within a pod: ${dupNames.join(", ")}`);
        }

        const manifest = makePodManifest(this.props);
        return (<Resource
            key={key}
            config={this.props.config}
            kind="Pod"
            metadata={manifest.metadata}
            spec={manifest.spec} />);
    }

    async status(_observe: ObserveForStatus, buildData: BuildData) {
        const succ = buildData.successor;
        if (!succ) return undefined;
        return succ.status();
    }
}

/**
 * Tests whether x is a Pod element
 *
 * @param x value to test
 * @returns `true` if x is a Pod element, false otherwise
 */
export function isPod(x: any): x is AdaptElement<PodProps> {
    if (!isElement(x)) return false;
    if (x.componentType === Pod) return true;
    return false;
}

/*
 * Plugin info
 */

/**
 * Spec for for Kubernetes Pods
 *
 * @public
 */
export interface PodSpec {
    containers: ContainerSpec[];
    terminationGracePeriodSeconds?: number;
}

function deployedWhen(statusObj: unknown) {
    const status: any = statusObj;
    if (!status || !status.status) return waiting(`Kubernetes cluster returned invalid status for Pod`);
    if (status.status.phase === "Running") return true;
    let msg = `Pod state ${status.status.phase}`;
    if (Array.isArray(status.status.conditions)) {
        const failing = status.status.conditions
            .filter((cond: any) => cond.status !== "True")
            .map((cond: any) => cond.message)
            .join("; ");
        if (failing) msg += `: ${failing}`;
    }
    return waiting(msg);
}

/** @internal */
export const podResourceInfo = {
    kind: "Pod",
    apiName: "pods",
    deployedWhen,
    statusQuery: async (props: ResourceProps, observe: ObserveForStatus, buildData: BuildData) => {
        const obs: any = await observe(K8sObserver, gql`
            query ($name: String!, $kubeconfig: JSON!, $namespace: String!) {
                withKubeconfig(kubeconfig: $kubeconfig) {
                    readCoreV1NamespacedPod(name: $name, namespace: $namespace) @all(depth: 100)
                }
            }`,
            {
                name: resourceIdToName(props.key, buildData.id, buildData.deployID),
                kubeconfig: props.config.kubeconfig,
                namespace: computeNamespaceFromMetadata(props.metadata)
            }
        );
        return obs.withKubeconfig.readCoreV1NamespacedPod;
    },
};

registerResourceKind(podResourceInfo);
