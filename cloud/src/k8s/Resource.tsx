import Adapt, { AdaptElement, childrenToArray, PrimitiveComponent } from "@usys/adapt";
import * as ld from "lodash";

/*
 * To add a new Resource, search for comments containing ResourceAdd
 * in this directory. That should show all the places that will need
 * modified, in addition to a new .tsx file, patterned after Pod or
 * Service.
 */

import { PodSpec } from "./Pod";
import { ServiceSpec } from "./Service";

export enum Kind {
    pod = "Pod",
    service = "Service",
    // NOTE: ResourceAdd
}

export type Spec =
    PodSpec |
    ServiceSpec
    // NOTE: ResourceAdd
    ;

export interface Metadata {
    namespace?: string;
    labels?: { [key: string]: string };
    annotations?: { [key: string]: string };
}

export interface ResourceBase {
    config: object; //Legal kubeconfig object
    kind: Kind;
    metadata?: Metadata;
}

export interface ResourcePod extends ResourceBase {
    kind: Kind.pod;
    spec: PodSpec;
}

export interface ResourceService extends ResourceBase {
    kind: Kind.service;
    spec: ServiceSpec;
}

export type ResourceProps =
    ResourcePod |
    ResourceService
    // NOTE: ResourceAdd
    ;

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
