import { childrenToArray, isElement, PrimitiveComponent, UnbsElement } from "@usys/adapt";
import * as ld from "lodash";
import { Container, ContainerProps } from "./Container";

export interface PodProps {
    name: string;
    config: any; //Legal configuration loaded from kubeconfig
    children: UnbsElement | UnbsElement[];
}

function isContainerArray(children: any[]): children is UnbsElement<ContainerProps>[] {
    try {
        children.map((child) => {
            if (!isElement(child)) throw new Error();
            if (child.componentType !== Container) throw new Error();
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

function validateProps(props: PodProps) {
    const children = childrenToArray(props.children);

    if (ld.isEmpty(children)) throw new Error("Pods must have at least one container");
    if (!isContainerArray(children)) throw new Error(`Pod children must be of type ${Container.name}`);

    const containerNames = children.map((child) => child.props.name);
    const dupNames = dups(containerNames);
    if (!ld.isEmpty(dupNames)) {
        throw new Error(`Duplicate names within a pod: ${dupNames.join(", ")}`);
    }
}

export class Pod extends PrimitiveComponent<PodProps> {
    constructor(props: PodProps) {
        validateProps(props);
        super(props);
    }
}
