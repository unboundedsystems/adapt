import { BuildData, ObserveForStatus } from "@usys/adapt";
import { PodSpec } from "./Pod";
import { ServiceSpec } from "./Service";

export type Kind = string;

export interface CRSpec {
    [key: string]: any;
}

export type Spec =
    PodSpec |
    ServiceSpec |
    CRSpec;

export interface Metadata {
    namespace?: string;
    labels?: { [key: string]: string };
    annotations?: { [key: string]: string };
}

export type ResourceProps =
    ResourcePod |
    ResourceService |
    ResourceCR;

export interface ResourceInfo {
    kind: Kind;
    apiName: string;
    statusQuery?: (props: ResourceProps, observe: ObserveForStatus, buildData: BuildData) => unknown | Promise<unknown>;
    specsEqual(actual: Spec, element: Spec): boolean;
}

export interface ResourceBase {
    config: object; //Legal kubeconfig object
    kind: Kind;
    metadata?: Metadata;
}

export interface ResourcePod extends ResourceBase {
    kind: "Pod";
    spec: PodSpec;
}

export interface ResourceService extends ResourceBase {
    kind: "Service";
    spec: ServiceSpec;
}

export interface ResourceCR extends ResourceBase {
    kind: string;
    spec: CRSpec;
}

export function computeNamespaceFromMetadata(metadata?: Metadata) {
    if (!metadata) return "default";
    if (!metadata.namespace) return "default";
    return metadata.namespace;
}

export interface Kubeconfig {
    kind: "Config";
    "current-context": string;
    contexts: [{
        name: string,
        context: {
            cluster: string,
            user: string
        }
    }];
    clusters: [{
        name: string,
        cluster: {
            "certificate-authority-data": string;
            server: string;
        };
    }];
    users: [{
        name: string,
        user: {
            "client-certificate-data"?: string;
            "client-key-data"?: string;
            "username"?: string;
            "password"?: string;
        }
    }];
}
