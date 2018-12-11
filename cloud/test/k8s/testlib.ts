import { K8sObserver } from "../../src/k8s/k8s_observer";

export function forceK8sObserverSchemaLoad(): void {
    (new K8sObserver()).schema;
}

export interface K8sTestStatusType {
    //Why is this needed?  Without, typescript will complain (at use) that this has nothing in common with Status
    noStatus?: true;
    kind: string;
    metadata: {
        name: string;
        annotations: { [key: string]: any }
        labels?: { [key: string]: any }
    };
}
