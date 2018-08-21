import Adapt, { AdaptElement, childrenToArray, PrimitiveComponent } from "@usys/adapt";
import * as ld from "lodash";
import { ContainerPort, EnvVar } from "./Container";

export enum Kind {
    pod = "Pod",
}

export type Spec = PodSpec; // | DeploymentSpec | etc.
export interface Metadata {
    namespace?: string;
    labels?: { [key: string]: string };
    annotations?: { [key: string]: string };
}

export interface ContainerSpec {
    name: string;
    args?: string[];
    command?: string[];
    env?: EnvVar[];
    image: string;
    tty?: boolean;
    ports?: ContainerPort[];
    workingDir?: string;
}

export interface PodSpec {
    containers: ContainerSpec[];
    terminationGracePeriodSeconds?: number;
}

export interface ResourceProps {
    config: object; //Legal kubeconfig object
    kind: Kind;
    metadata?: Metadata;
    spec: Spec;
}

export function isResourceElement(e: AdaptElement): e is AdaptElement<ResourceProps & Adapt.BuiltinProps> {
    return e.componentType === Resource;
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

}
