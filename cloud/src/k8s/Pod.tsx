import Adapt, {
    AdaptElement,
    BuildData,
    BuildNotImplemented,
    childrenToArray,
    DeferredComponent,
    gql,
    isElement,
    ObserveForStatus
} from "@usys/adapt";
import { removeUndef } from "@usys/utils";
import * as ld from "lodash";
import { computeNamespaceFromMetadata, Kind } from "./common";
import { ContainerSpec, isContainerElement, K8sContainer, K8sContainerProps } from "./Container";
import { K8sObserver } from "./k8s_observer";
import { resourceIdToName } from "./k8s_plugin";
import { Resource, ResourceProps } from "./Resource";

export interface PodProps {
    config: any; //Legal configuration loaded from kubeconfig
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

function makePodManifest(props: PodProps) {
    const containers = ld.compact(
        childrenToArray(props.children)
            .map((c) => isContainerElement(c) ? c : null));

    const spec: PodSpec = {
        containers: containers.map((c) => removeUndef({
            args: c.props.args,
            command: c.props.command, //FIXME(manishv)  What if we just have args and no command?
            env: c.props.env,
            image: c.props.image,
            name: c.props.name,
            ports: c.props.ports,
            tty: c.props.tty,
            workingDir: c.props.workingDir,
        })),
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
        terminationGracePeriodSeconds: 30
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
            kind={Kind.pod}
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

export const podResourceInfo = {
    kind: Kind.pod,
    apiName: "pods",
    statusQuery: async (props: ResourceProps, observe: ObserveForStatus, buildData: BuildData) => {
        const obs: any = await observe(K8sObserver, gql`
            query ($name: String!, $kubeconfig: JSON!, $namespace: String!) {
                withKubeconfig(kubeconfig: $kubeconfig) {
                    readCoreV1NamespacedPod(name: $name, namespace: $namespace) @all(depth: 100)
                }
            }`,
            {
                name: resourceIdToName(buildData.id, buildData.deployID),
                kubeconfig: props.config,
                namespace: computeNamespaceFromMetadata(props.metadata)
            }
        );
        return obs.withKubeconfig.readCoreV1NamespacedPod;
    },
    specsEqual: podSpecsEqual,
};
