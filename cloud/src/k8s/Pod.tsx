import Adapt, {
    AdaptElement,
    BuildNotImplemented,
    BuiltinProps,
    childrenToArray,
    DeferredComponent,
    isElement
} from "@usys/adapt";
import * as ld from "lodash";
import { isContainerElement, K8sContainer, K8sContainerProps } from "./Container";
import { Kind, Resource } from "./Resource";

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

function makePodManifest(props: PodProps & BuiltinProps) {
    const containers = ld.compact(
        childrenToArray(props.children)
            .map((c) => isContainerElement(c) ? c : null));

    return {
        apiVersion: "v1",
        kind: "Pod",
        metadata: {},
        spec: {
            containers: containers.map((c) => ({
                name: c.props.name,
                image: c.props.image,
                command: c.props.command //FIXME(manishv)  What if we just have args and no command?
            })),
            terminationGracePeriodSeconds: props.terminationGracePeriodSeconds
        }
    };
}

export class Pod extends DeferredComponent<PodProps & BuiltinProps> {
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
}
