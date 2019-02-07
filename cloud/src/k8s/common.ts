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
            "client-certificate-data": string,
            "client-key-data": string
        }
    }];
}
