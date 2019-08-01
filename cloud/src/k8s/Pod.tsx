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
import { removeUndef } from "@adpt/utils";
import * as ld from "lodash";
import { ClusterInfo, computeNamespaceFromMetadata, ResourceProps } from "./common";
import { ContainerSpec, isContainerElement, K8sContainer, K8sContainerProps } from "./Container";
import { K8sObserver } from "./k8s_observer";
import { registerResourceKind, resourceIdToName } from "./k8s_plugin";
import { Resource } from "./Resource";

export interface PodProps {
    config: ClusterInfo;
    terminationGracePeriodSeconds?: number;
    children: AdaptElement | AdaptElement[];
}

function isContainerArray(children: any[]): children is AdaptElement<K8sContainerProps>[] {
    try {
        children.map((child) => {
            if (!isElement(child)) throw new Error();
            if (child.componentType !== K8sContainer) throw new Error();
        });
        return true;
    } catch (e) {
        return false;
    }
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
            .map((c) => isContainerElement(c) ? c : null));

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

export class Pod extends DeferredComponent<PodProps> {
    static defaultProps = {
        terminationGracePeriodSeconds: 30,
    };

    checkProps(): void {
        const children = childrenToArray(this.props.children);

        if (ld.isEmpty(children)) throw new BuildNotImplemented("Pods must have at least one container");
        if (!isContainerArray(children)) {
            throw new BuildNotImplemented(`Pod children must be of type ${K8sContainer.name}`);
        }

        const containerNames = children.map((child) => child.props.name);
        const dupNames = dups(containerNames);
        if (!ld.isEmpty(dupNames)) {
            throw new BuildNotImplemented(`Duplicate names within a pod: ${dupNames.join(", ")}`);
        }
    }

    build() {
        this.checkProps();
        const manifest = makePodManifest(this.props);
        return (<Resource
            key={this.props.key}
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

/*
 * Plugin info
 */

export interface PodSpec {
    containers: ContainerSpec[];
    terminationGracePeriodSeconds?: number;
}

const knownContainerPaths = [
    "args",
    "command",
    "env",
    "image",
    "name",
    "ports",
    "tty",
    "workingDir",
    "imagePullPolicy"
];

const knownPodSpecPaths = [
    "containers",
    "terminationGracePeriodSeconds"
];

function podSpecsEqual(spec1: PodSpec, spec2: PodSpec) {
    function processContainers(spec: PodSpec) {
        if (spec.containers === undefined) return;
        spec.containers = spec.containers
            .map((c) => ld.pick(c, knownContainerPaths) as any);
        spec.containers = ld.sortBy(spec.containers, (c) => c.name);
    }
    const s1 = ld.pick(spec1, knownPodSpecPaths) as PodSpec;
    const s2 = ld.pick(spec2, knownPodSpecPaths) as PodSpec;
    processContainers(s1);
    processContainers(s2);

    return ld.isEqual(s1, s2);
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
                name: resourceIdToName(buildData.id, buildData.deployID),
                kubeconfig: props.config.kubeconfig,
                namespace: computeNamespaceFromMetadata(props.metadata)
            }
        );
        return obs.withKubeconfig.readCoreV1NamespacedPod;
    },
    specsEqual: podSpecsEqual,
};

registerResourceKind(podResourceInfo);
