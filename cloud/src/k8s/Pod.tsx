import { AdaptElement, childrenToArray, isElement, PrimitiveComponent } from "@usys/adapt";
import * as ld from "lodash";
import { K8sContainer, K8sContainerProps } from "./Container";

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

export class Pod extends PrimitiveComponent<PodProps> {
    validate() {
        const children = childrenToArray(this.props.children);

        if (ld.isEmpty(children)) return "Pods must have at least one container";
        if (!isContainerArray(children)) return `Pod children must be of type ${K8sContainer.name}`;

        const containerNames = children.map((child) => child.props.name);
        const dupNames = dups(containerNames);
        if (!ld.isEmpty(dupNames)) {
            return `Duplicate names within a pod: ${dupNames.join(", ")}`;
        }
    }
}
